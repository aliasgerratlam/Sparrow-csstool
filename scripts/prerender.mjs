// Prerender the static marketing routes to HTML so crawlers (and social/AI
// bots that don't run JS) get real content instead of an empty <div id="root">.
//
// The app is a client-rendered SPA, so we render it in a real headless browser
// (modern Chromium via puppeteer) rather than in Node — that sidesteps the
// app's many browser-only assumptions (window at module load, Clerk, Supabase).
// For each route we load the built app, wait for React to fill #root, then write
// the fully-rendered outerHTML back over the route's index.html. main.tsx
// detects the prerendered markup and hydrates instead of re-rendering.
//
// Local runs: set PUPPETEER_EXECUTABLE_PATH to a Chromium/Edge binary (this repo
// has no bundled Chromium in some sandboxes). On Vercel, puppeteer downloads its
// own Chromium at install time and this env var is unset — the default is used.
//
// Third-party requests (Clerk, Supabase, Google Fonts, Analytics) are blocked
// during the crawl: they can't authenticate on localhost anyway, would slow the
// crawl, and must not fire real Analytics hits from the build. The app renders
// its signed-out marketing UI regardless (auth loading never gates the tree).

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DIST = join(ROOT, 'dist')
const ROUTES = ['/', '/privacy', '/terms']
const PORT = 45678

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

async function tryFile(path) {
  try {
    const s = await stat(path)
    if (s.isFile()) return await readFile(path)
  } catch {
    /* not a file */
  }
  return null
}

// Minimal static server for dist/ with SPA fallback — mirrors the production
// Vercel rewrite so client routing resolves during the crawl.
//
// `template` is the PRISTINE index.html (empty #root, no per-route metadata),
// read once before we start overwriting files. Every HTML/extensionless request
// is served this template so the router renders fresh — crucially it is NOT the
// prerendered index.html we write mid-crawl, which would leak the homepage's
// baked-in <head>/content into the next route.
function serve(template) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      const rel = decodeURIComponent(url.pathname)
      const ext = extname(rel)
      // Real static assets (js/css/images/fonts/…) come off disk.
      if (ext && ext !== '.html') {
        const body = await tryFile(join(DIST, rel))
        if (body) {
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
          })
          res.end(body)
          return
        }
      }
      // Everything else (routes, "/") → the pristine SPA template.
      res.writeHead(200, { 'Content-Type': MIME['.html'] })
      res.end(template)
    })
    server.listen(PORT, () => resolve(server))
  })
}

async function main() {
  // Read the pristine template BEFORE we overwrite any index.html files.
  const template = await tryFile(join(DIST, 'index.html'))
  if (!template) {
    throw new Error('dist/index.html not found — run the build before prerender.')
  }

  const server = await serve(template)
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  let failed = 0
  try {
    for (const route of ROUTES) {
      const page = await browser.newPage()
      await page.setRequestInterception(true)
      page.on('request', (r) => {
        // Allow only same-origin (localhost) assets; block all third parties.
        if (new URL(r.url()).hostname === 'localhost') r.continue()
        else r.abort()
      })

      const url = `http://localhost:${PORT}${route}`
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 })
        // Wait until React has rendered content into #root.
        await page.waitForFunction(
          () => {
            const el = document.getElementById('root')
            return !!el && el.childElementCount > 0
          },
          { timeout: 30000 },
        )
        // Let React 19 flush its hoisted <title>/<meta> into <head>.
        await page.waitForFunction(() => !!document.title, { timeout: 5000 })

        const html = '<!DOCTYPE html>\n' + (await page.content())
        const outPath =
          route === '/'
            ? join(DIST, 'index.html')
            : join(DIST, route.slice(1), 'index.html')
        await mkdir(dirname(outPath), { recursive: true })
        await writeFile(outPath, html, 'utf-8')
        const title = await page.title()
        console.log(`  prerendered ${route.padEnd(10)} → "${title}"`)
      } catch (err) {
        failed++
        console.error(`  FAILED ${route}: ${err.message}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }

  if (failed > 0) {
    throw new Error(`${failed} route(s) failed to prerender`)
  }
  console.log(`\n✓ prerendered ${ROUTES.length} route(s)`)
}

// Prerender is an SEO enhancement layered on top of a fully-functional SPA, so a
// failure here (e.g. puppeteer can't launch Chromium in a CI/build container
// missing its shared libraries) must NOT break the deploy. Warn loudly and exit
// 0: the site still ships with robots.txt, sitemap.xml, JSON-LD, and per-route
// <Seo> metadata — only the static HTML snapshot is missing, which Google's JS
// renderer can still cover. Watch the build log to confirm prerender ran.
main().catch((err) => {
  console.warn(
    '\n' +
      '┌─────────────────────────────────────────────────────────────┐\n' +
      '│  ⚠  PRERENDER SKIPPED — marketing routes were NOT snapshotted │\n' +
      '└─────────────────────────────────────────────────────────────┘\n' +
      `  Reason: ${err.message}\n` +
      '  The build still succeeds and the SPA + SEO metadata ship fine.\n' +
      '  If this is the Vercel build, Chromium likely failed to launch —\n' +
      '  see scripts/prerender.mjs for how to point it at a browser.\n',
  )
  process.exit(0)
})
