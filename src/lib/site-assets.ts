import { CHROME_SELECTOR } from './site-colors'

/** Split on top-level commas only (commas inside `rgb(…)` etc. are ignored).
    Used to split layered background-image values into individual
    `url()`/gradient layers, and `srcset` into candidates. */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim())
}

/* ─────────────────────────────────────────────────────────────────────────
   Site-wide asset scan — walk the whole inspected page and collect every
   image/visual asset it references: <img>/<picture>/srcset, SVG <image>,
   favicons, <video> sources + posters, inline <svg> markup, and any url(...)
   found in computed styles (backgrounds, masks, borders, cursors, content).
   Framework-agnostic like the color/font scans; the panel handles React.

   Gradients are intentionally invisible here — extraction only reacts to
   `url(` tokens, so pure-gradient backgrounds produce no assets.
───────────────────────────────────────────────────────────────────────── */

export type AssetKind = 'raster' | 'svg' | 'inline-svg' | 'data-uri' | 'video'

export type AssetSource =
  | 'img'
  | 'picture'
  | 'svg-image'
  | 'favicon'
  | 'css'
  | 'inline-svg'
  | 'video'
  | 'video-poster'

export interface SiteAsset {
  /** Dedupe key: absolute URL, the full data: URI, or `inline-svg:<n>`. */
  id: string
  kind: AssetKind
  /** Distinct places it appeared (deduped, for badges). */
  sources: AssetSource[]
  /** Absolute URL (or data: URI). null only for inline SVG. */
  url: string | null
  /** What the grid preview renders — url, data URI, or encoded inline-SVG. */
  previewUrl: string
  /** Derived filename, made unique across the scan (logo.png, logo-2.png). */
  filename: string
  /** '' when unknown — resolved from Content-Type at download time. */
  ext: string
  mime: string | null
  /** Distinct referencing elements/rules. */
  usageCount: number
  width: number | null
  height: number | null
  /** CSS properties that referenced it (kind 'css' hits). */
  cssProps: string[]
  /** Serialized markup — only for kind 'inline-svg'. */
  svgMarkup?: string
}

const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogv', 'mov'])

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
}

export function extFromMime(mime: string): string {
  return MIME_TO_EXT[mime.toLowerCase()] ?? ''
}

/* Computed-style properties that can carry url() image references. */
const URL_PROPS = [
  'background-image',
  'mask-image',
  '-webkit-mask-image',
  'border-image-source',
  'list-style-image',
  'content',
  'cursor',
]

/** Pull every url(...) reference out of a (possibly layered) CSS value. */
export function extractCssUrls(value: string): string[] {
  if (!value || value === 'none') return []
  const out: string[] = []
  for (const layer of splitTopLevel(value)) {
    const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s][^)]*?))\s*\)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(layer))) {
      const raw = m[1] ?? m[2] ?? m[3]
      if (raw) out.push(raw)
    }
  }
  return out
}

/** Parse a srcset attribute into candidates scored by size (w or x density). */
export function parseSrcset(
  srcset: string,
  baseHref: string,
): { url: string; score: number }[] {
  const out: { url: string; score: number }[] = []
  for (const candidate of splitTopLevel(srcset)) {
    const [rawUrl, descriptor] = candidate.trim().split(/\s+/)
    if (!rawUrl) continue
    let score = 1
    if (descriptor) {
      const n = parseFloat(descriptor)
      if (!Number.isNaN(n)) score = descriptor.endsWith('w') ? n : n * 1000
    }
    try {
      out.push({ url: new URL(rawUrl, baseHref).href, score })
    } catch {
      /* unparseable candidate — skip */
    }
  }
  return out
}

/** Derive a filename from a URL's pathname; empty paths become `asset`. */
export function filenameFromUrl(
  absUrl: string,
  fallbackExt: string,
): { name: string; ext: string } {
  let base = ''
  try {
    base = decodeURIComponent(new URL(absUrl).pathname.split('/').pop() ?? '')
  } catch {
    /* fall through to fallback name */
  }
  const dot = base.lastIndexOf('.')
  if (dot > 0 && dot < base.length - 1) {
    return { name: base, ext: base.slice(dot + 1).toLowerCase() }
  }
  const name = base || 'asset'
  return { name: fallbackExt ? `${name}.${fallbackExt}` : name, ext: fallbackExt }
}

/** Load an image off-DOM to learn its intrinsic size (null on error/timeout). */
export function loadImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    const timer = setTimeout(() => resolve(null), 5000)
    img.onload = () => {
      clearTimeout(timer)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

// ── Scan ─────────────────────────────────────────────────────────────────

interface MutableAsset extends SiteAsset {
  sources: AssetSource[]
  cssProps: string[]
}

interface UsagePartial {
  kind: AssetKind
  source: AssetSource
  url: string | null
  previewUrl: string
  filename: string
  ext: string
  mime?: string | null
  width?: number | null
  height?: number | null
  cssProp?: string
  svgMarkup?: string
}

function classifyExt(ext: string): AssetKind {
  if (ext === 'svg') return 'svg'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'raster'
}

/** Resolve + validate a raw ref; returns null for non-http(s)/data schemes. */
function resolveUrl(raw: string): string | null {
  try {
    const u = new URL(raw, document.baseURI)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
    return null
  } catch {
    return null
  }
}

export function scanSiteAssets(): SiteAsset[] {
  const map = new Map<string, MutableAsset>()
  const inlineSvgIds = new Map<string, string>() // markup → id
  let dataUriCount = 0

  const addUsage = (id: string, p: UsagePartial) => {
    const existing = map.get(id)
    if (existing) {
      existing.usageCount++
      if (!existing.sources.includes(p.source)) existing.sources.push(p.source)
      if (p.cssProp && !existing.cssProps.includes(p.cssProp))
        existing.cssProps.push(p.cssProp)
      if (existing.width == null && p.width != null) {
        existing.width = p.width
        existing.height = p.height ?? null
      }
      return
    }
    map.set(id, {
      id,
      kind: p.kind,
      sources: [p.source],
      url: p.url,
      previewUrl: p.previewUrl,
      filename: p.filename,
      ext: p.ext,
      mime: p.mime ?? null,
      usageCount: 1,
      width: p.width ?? null,
      height: p.height ?? null,
      cssProps: p.cssProp ? [p.cssProp] : [],
      svgMarkup: p.svgMarkup,
    })
  }

  /** Add a URL-based asset (file URL or data: URI) from any source. */
  const addRef = (
    raw: string,
    source: AssetSource,
    opts: { cssProp?: string; width?: number | null; height?: number | null; forceKind?: AssetKind } = {},
  ) => {
    if (!raw) return
    if (raw.startsWith('data:')) {
      addDataUri(raw, source, opts.cssProp)
      return
    }
    const abs = resolveUrl(raw)
    if (!abs) return
    const { name, ext } = filenameFromUrl(abs, '')
    addUsage(abs, {
      kind: opts.forceKind ?? classifyExt(ext),
      source,
      url: abs,
      previewUrl: abs,
      filename: name,
      ext,
      width: opts.width,
      height: opts.height,
      cssProp: opts.cssProp,
    })
  }

  const addDataUri = (uri: string, source: AssetSource, cssProp?: string) => {
    const header = uri.slice(5, uri.indexOf(',') === -1 ? uri.length : uri.indexOf(','))
    const mime = (header.split(';')[0] ?? '').toLowerCase()
    // Only image/video data URIs are assets; skip fonts and other payloads.
    if (mime && !mime.startsWith('image/') && !mime.startsWith('video/')) return
    const existing = map.get(uri)
    if (existing) {
      addUsage(uri, {
        kind: 'data-uri',
        source,
        url: uri,
        previewUrl: uri,
        filename: existing.filename,
        ext: existing.ext,
        cssProp,
      })
      return
    }
    dataUriCount++
    const ext = extFromMime(mime) || 'bin'
    addUsage(uri, {
      kind: 'data-uri',
      source,
      url: uri,
      previewUrl: uri,
      filename: `data-image-${dataUriCount}.${ext}`,
      ext,
      mime,
      cssProp,
    })
  }

  const addInlineSvg = (el: SVGSVGElement) => {
    const clone = el.cloneNode(true) as SVGSVGElement
    if (!clone.getAttribute('xmlns'))
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const markup = new XMLSerializer().serializeToString(clone)
    let id = inlineSvgIds.get(markup)
    if (id) {
      addUsage(id, {
        kind: 'inline-svg',
        source: 'inline-svg',
        url: null,
        previewUrl: map.get(id)!.previewUrl,
        filename: map.get(id)!.filename,
        ext: 'svg',
      })
      return
    }
    id = `inline-svg:${inlineSvgIds.size + 1}`
    inlineSvgIds.set(markup, id)
    // Prefer the rendered box; fall back to the viewBox for hidden icons.
    const rect = el.getBoundingClientRect()
    const vb = el.viewBox.baseVal
    const width = Math.round(rect.width) || Math.round(vb?.width ?? 0) || null
    const height = Math.round(rect.height) || Math.round(vb?.height ?? 0) || null
    addUsage(id, {
      kind: 'inline-svg',
      source: 'inline-svg',
      url: null,
      previewUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(markup),
      filename: `inline-svg-${inlineSvgIds.size}.svg`,
      ext: 'svg',
      mime: 'image/svg+xml',
      width,
      height,
      svgMarkup: markup,
    })
  }

  const addCssUrls = (style: CSSStyleDeclaration, source: AssetSource) => {
    for (const prop of URL_PROPS) {
      const value = style.getPropertyValue(prop)
      if (!value || value === 'none') continue
      for (const raw of extractCssUrls(value)) addRef(raw, source, { cssProp: prop })
    }
  }

  // 1) Favicons from <head> (outside the body walk).
  const iconLinks = document.head.querySelectorAll<HTMLLinkElement>(
    'link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="apple-touch-icon-precomposed"],link[rel="mask-icon"]',
  )
  for (const link of Array.from(iconLinks)) {
    if (link.href) addRef(link.href, 'favicon')
  }

  // 2) Full page walk.
  for (const el of document.body.querySelectorAll<Element>('*')) {
    if (el.closest(CHROME_SELECTOR)) continue

    let cs: CSSStyleDeclaration
    try {
      cs = getComputedStyle(el)
    } catch {
      continue
    }
    // Skip hidden elements — <source> children of <picture>/<video> are
    // display:none by nature, so those are read via their parent below.
    if (cs.display === 'none' && !(el instanceof HTMLSourceElement)) continue

    if (el instanceof HTMLImageElement) {
      const src = el.currentSrc || el.src
      if (src)
        addRef(src, 'img', {
          width: el.naturalWidth || null,
          height: el.naturalHeight || null,
        })
      // Also surface the largest responsive variant — that's the file a
      // designer wants to save — when it differs from what rendered.
      if (el.srcset) {
        const candidates = parseSrcset(el.srcset, document.baseURI)
        const largest = candidates.sort((a, b) => b.score - a.score)[0]
        if (largest && largest.url !== src) addRef(largest.url, 'img')
      }
    } else if (el instanceof HTMLPictureElement) {
      for (const source of Array.from(el.querySelectorAll('source'))) {
        const srcset = source.getAttribute('srcset')
        if (!srcset) continue
        const largest = parseSrcset(srcset, document.baseURI).sort(
          (a, b) => b.score - a.score,
        )[0]
        if (largest) addRef(largest.url, 'picture')
      }
    } else if (el instanceof SVGImageElement) {
      const href =
        el.href?.baseVal || el.getAttribute('href') || el.getAttribute('xlink:href')
      if (href) addRef(href, 'svg-image')
    } else if (el instanceof SVGSVGElement && !el.ownerSVGElement) {
      addInlineSvg(el)
    } else if (el instanceof HTMLVideoElement) {
      const src = el.currentSrc || el.src
      if (src)
        addRef(src, 'video', {
          forceKind: 'video',
          width: el.videoWidth || null,
          height: el.videoHeight || null,
        })
      for (const source of Array.from(el.querySelectorAll('source'))) {
        if (source.src) addRef(source.src, 'video', { forceKind: 'video' })
      }
      if (el.poster) addRef(el.poster, 'video-poster')
    }

    // url() references in computed styles — element and painted pseudos.
    addCssUrls(cs, 'css')
    for (const pseudo of ['::before', '::after'] as const) {
      try {
        const ps = getComputedStyle(el, pseudo)
        if (ps.content !== 'none') addCssUrls(ps, 'css')
      } catch {
        /* ignore */
      }
    }
  }

  // 3) Uniquify filenames so the ZIP never collides (logo.png, logo-2.png).
  const seen = new Map<string, number>()
  const assets = Array.from(map.values())
  for (const a of assets) {
    const key = a.filename.toLowerCase()
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    if (n > 0) {
      const dot = a.filename.lastIndexOf('.')
      a.filename =
        dot > 0
          ? `${a.filename.slice(0, dot)}-${n + 1}${a.filename.slice(dot)}`
          : `${a.filename}-${n + 1}`
    }
  }

  // Most-used first; videos sink to the end.
  return assets.sort((a, b) => {
    const av = a.kind === 'video' ? 1 : 0
    const bv = b.kind === 'video' ? 1 : 0
    if (av !== bv) return av - bv
    return b.usageCount - a.usageCount
  })
}
