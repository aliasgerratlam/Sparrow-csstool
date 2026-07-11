import { downloadZip } from 'client-zip'
import { extFromMime, type SiteAsset } from './site-assets'

/* ─────────────────────────────────────────────────────────────────────────
   Asset download helpers — turn a SiteAsset into a Blob (serialize inline
   SVG, decode data: URIs, fetch file URLs) and save it via an anchor click,
   singly or bundled into a ZIP (client-zip). Cross-origin fetches can fail
   (CORS); single downloads fall back to opening the URL in a new tab, and
   ZIP assembly skips failures and reports them.
───────────────────────────────────────────────────────────────────────── */

export function decodeDataUri(uri: string): { blob: Blob; mime: string } {
  const comma = uri.indexOf(',')
  const header = comma === -1 ? uri.slice(5) : uri.slice(5, comma)
  const payload = comma === -1 ? '' : uri.slice(comma + 1)
  const parts = header.split(';')
  const mime = (parts[0] || 'application/octet-stream').toLowerCase()
  if (parts.some((p) => p.trim() === 'base64')) {
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { blob: new Blob([bytes], { type: mime }), mime }
  }
  return { blob: new Blob([decodeURIComponent(payload)], { type: mime }), mime }
}

/** Kind-aware Blob conversion. Throws on network/CORS failure. */
export async function assetToBlob(asset: SiteAsset): Promise<Blob> {
  if (asset.kind === 'inline-svg' && asset.svgMarkup) {
    return new Blob([asset.svgMarkup], { type: 'image/svg+xml' })
  }
  if (asset.kind === 'data-uri' && asset.url) {
    return decodeDataUri(asset.url).blob
  }
  if (!asset.url) throw new Error('Asset has no URL')
  const resp = await fetch(asset.url, { mode: 'cors', credentials: 'omit' })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.blob()
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  // The scanner's document-level capture click handler preventDefault()s any
  // click outside its own chrome — which cancels an anchor download. The
  // `scanner-` class prefix marks the anchor as chrome so it flows through.
  a.className = 'scanner-download-anchor'
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Extensionless URLs get their real extension from the response type. */
function filenameFor(asset: SiteAsset, blob: Blob): string {
  if (asset.ext) return asset.filename
  const ext = extFromMime(blob.type)
  return ext ? `${asset.filename}.${ext}` : asset.filename
}

/** Download one asset; cross-origin failures open the URL in a new tab. */
export async function downloadAsset(asset: SiteAsset): Promise<'ok' | 'fallback'> {
  try {
    const blob = await assetToBlob(asset)
    triggerBlobDownload(blob, filenameFor(asset, blob))
    return 'ok'
  } catch {
    // The download attribute is ignored cross-origin, so an anchor attempt
    // is pointless — a new tab at least lets the user right-click-save.
    if (asset.url && !asset.url.startsWith('data:'))
      window.open(asset.url, '_blank', 'noopener')
    return 'fallback'
  }
}

export interface ZipResult {
  included: SiteAsset[]
  failed: SiteAsset[]
}

/** Fetch every asset, bundle the successes into a ZIP, and save it. */
export async function downloadAssetsAsZip(
  assets: SiteAsset[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ZipResult> {
  const entries: { name: string; input: Blob }[] = []
  const included: SiteAsset[] = []
  const failed: SiteAsset[] = []
  let done = 0
  for (const asset of assets) {
    try {
      const blob = await assetToBlob(asset)
      entries.push({ name: filenameFor(asset, blob), input: blob })
      included.push(asset)
    } catch {
      failed.push(asset)
    }
    done++
    onProgress?.(done, assets.length)
  }
  if (entries.length === 0) throw new Error('No assets could be downloaded')
  const blob = await downloadZip(entries).blob()
  triggerBlobDownload(blob, zipName)
  return { included, failed }
}
