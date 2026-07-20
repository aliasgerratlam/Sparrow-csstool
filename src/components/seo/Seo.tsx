/* Per-route SEO metadata. Uses React 19's native support for hoisting
   <title>/<meta>/<link> from anywhere in the tree into <head> — so each route
   emits its own title, description, canonical, and Open Graph/Twitter tags with
   no helmet library. This is what makes prerendering (react-snap) worthwhile:
   the crawled HTML for "/", "/privacy", "/terms" each carries correct, distinct
   metadata instead of the single shared set that used to live in index.html.

   Keep exactly ONE <Seo> mounted per route — React renders every <title> you
   give it, so two mounted at once would emit two <title> tags. */

// Apex domain (matches vite allowedHosts). Canonical URLs + absolute OG image
// must be absolute for crawlers and social unfurlers.
export const SITE_URL = 'https://trysparrowcss.com'
const DEFAULT_IMAGE = `${SITE_URL}/sparrow-logo.png`

interface SeoProps {
  title: string
  description: string
  /** Route path, e.g. "/" or "/privacy". Used to build the canonical URL. */
  path: string
  image?: string
  /** Private/app routes (e.g. /account) that should not be indexed. */
  noindex?: boolean
}

export function Seo({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  noindex,
}: SeoProps) {
  const canonical = SITE_URL + (path === '/' ? '' : path)
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="Sparrow" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </>
  )
}
