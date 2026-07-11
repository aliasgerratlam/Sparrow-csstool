import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, GripHorizontal, Images, Play } from 'lucide-react'
import { useDraggable } from '@/hooks/use-draggable'
import {
  loadImageDimensions,
  scanSiteAssets,
  type SiteAsset,
} from '@/lib/site-assets'
import { downloadAsset, downloadAssetsAsZip } from '@/lib/download'

// Gap from the viewport's right edge to the panel's right edge. The rail is
// ~56px wide at right:14px (spans 14–70px in), so this leaves ~22px of air
// between the panel and the rail.
const RAIL_GAP = 92
const MARGIN = 8

type Filter = 'all' | 'raster' | 'svg' | 'video'

/* Which filter chip an asset belongs to — data URIs sort by their MIME. */
function filterKind(a: SiteAsset): Exclude<Filter, 'all'> {
  if (a.kind === 'video') return 'video'
  if (a.kind === 'svg' || a.kind === 'inline-svg') return 'svg'
  if (a.kind === 'data-uri' && a.mime === 'image/svg+xml') return 'svg'
  return 'raster'
}

function badgeLabel(a: SiteAsset): string {
  if (a.kind === 'inline-svg') return 'SVG'
  if (a.kind === 'data-uri') return 'DATA'
  return a.ext ? a.ext.toUpperCase() : 'IMG'
}

/* Assets tool: a whole-page media overview — every image, SVG, data-URI and
   video the page references (DOM + computed styles), with previews and
   per-asset or bundled ZIP download. Like the Colors/Fonts tools it reads the
   page as a whole; drag it by the header to move it aside. */
export function AssetsPanel() {
  const panelRef = useRef<HTMLDivElement>(null)
  const { pos: dragPos, dragging, onHandlePointerDown } = useDraggable(panelRef)

  const [assets, setAssets] = useState<SiteAsset[]>([])
  const [scanned, setScanned] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [zipNote, setZipNote] = useState('')
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set())

  // Dock beside the mode rail, vertically centered (same math as FontPanel —
  // measured in JS since the slide-in animation owns `transform`). Re-run once
  // the scan populates the grid: on mount the body is still the short
  // "Scanning page…" state, so centering that height alone leaves the panel
  // sitting low once it grows to full height. Keying on `scanned` re-centers
  // against the real (max-height-capped) size before paint.
  const [dockPos, setDockPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const left = Math.max(MARGIN, window.innerWidth - RAIL_GAP - panel.offsetWidth)
    const top = Math.max(MARGIN, Math.round((window.innerHeight - panel.offsetHeight) / 2))
    setDockPos({ top, left })
  }, [scanned])

  useEffect(() => {
    setAssets(scanSiteAssets())
    setScanned(true)
  }, [])

  // Fill in intrinsic dimensions for assets the scan couldn't size
  // synchronously (CSS urls, favicons) — a few at a time, off-DOM.
  useEffect(() => {
    if (!scanned) return
    let cancelled = false
    const pending = assets.filter(
      (a) => a.width == null && a.kind !== 'video' && a.previewUrl,
    )
    if (pending.length === 0) return
    let index = 0
    const worker = async () => {
      while (!cancelled && index < pending.length) {
        const asset = pending[index++]
        if (!asset) break
        const dims = await loadImageDimensions(asset.previewUrl)
        if (cancelled || !dims) continue
        setAssets((prev) =>
          prev.map((a) =>
            a.id === asset.id ? { ...a, width: dims.width, height: dims.height } : a,
          ),
        )
      }
    }
    for (let i = 0; i < Math.min(6, pending.length); i++) void worker()
    return () => {
      cancelled = true
    }
    // Re-running on every enrichment update would respawn workers; the scan
    // happens once, so keying on `scanned` is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned])

  const counts: Record<Filter, number> = { all: assets.length, raster: 0, svg: 0, video: 0 }
  for (const a of assets) counts[filterKind(a)]++

  const visible = filter === 'all' ? assets : assets.filter((a) => filterKind(a) === filter)

  // "Download all" zips the visible set — except under All, where videos are
  // excluded (they can be enormous); the Videos chip zips them explicitly.
  const zipSet = filter === 'all' ? visible.filter((a) => a.kind !== 'video') : visible
  const excludedVideos = filter === 'all' ? counts.video : 0

  const onDownloadOne = async (asset: SiteAsset) => {
    const result = await downloadAsset(asset)
    if (result === 'fallback')
      setFailedIds((prev) => new Set(prev).add(asset.id))
  }

  const onDownloadAll = async () => {
    if (busy || zipSet.length === 0) return
    setBusy(true)
    setZipNote('')
    try {
      const { failed } = await downloadAssetsAsZip(
        zipSet,
        `assets-${location.hostname || 'page'}.zip`,
        (done, total) => setZipNote(`Zipping ${done}/${total}…`),
      )
      setZipNote(failed.length ? `${failed.length} skipped (cross-origin)` : '')
      if (failed.length)
        setFailedIds((prev) => {
          const next = new Set(prev)
          for (const f of failed) next.add(f.id)
          return next
        })
    } catch {
      setZipNote('Download failed — no assets could be fetched')
    } finally {
      setBusy(false)
    }
  }

  const anchor = dragPos ?? dockPos
  const placement = anchor
    ? { top: anchor.top, left: anchor.left, right: 'auto', bottom: 'auto' }
    : undefined

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'raster', label: 'Images' },
    { key: 'svg', label: 'SVG' },
    { key: 'video', label: 'Videos' },
  ]

  return (
    <div
      id="scanner-assets-panel"
      ref={panelRef}
      className={dragging ? 'dragging' : undefined}
      style={placement}
    >
      <div className="sassets-head" onPointerDown={onHandlePointerDown}>
        <span className="sassets-grip" aria-hidden="true" title="Drag to move">
          <GripHorizontal size={16} />
        </span>
        <span className="sassets-icon">
          <Images size={16} />
        </span>
        <div className="sassets-head-text">
          <span className="sassets-title">Page Assets</span>
          <span className="sassets-sub">
            {zipNote ||
              (scanned
                ? `${assets.length} asset${assets.length === 1 ? '' : 's'} found` +
                  (excludedVideos > 0
                    ? ` · ${excludedVideos} video${excludedVideos === 1 ? '' : 's'} excluded`
                    : '')
                : 'Images, SVGs & media on this page')}
          </span>
        </div>
        <button
          type="button"
          className="sassets-zip"
          disabled={busy || zipSet.length === 0}
          // The head is the drag handle — don't let a button press wiggle the
          // panel.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void onDownloadAll()}
        >
          <Download size={13} />
          {busy ? 'Zipping…' : `Download all (${zipSet.length})`}
        </button>
      </div>

      <div className="sassets-filters" role="tablist" aria-label="Asset type filter">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={filter === c.key}
            className={'sassets-chip' + (filter === c.key ? ' active' : '')}
            onClick={() => setFilter(c.key)}
          >
            {c.label} <span className="sassets-chip-count">{counts[c.key]}</span>
          </button>
        ))}
      </div>

      <div className="sassets-body">
        {visible.length === 0 ? (
          <div className="sassets-empty">
            {scanned
              ? 'No downloadable assets found on this page.'
              : 'Scanning page…'}
          </div>
        ) : (
          <div className="sassets-grid">
            {visible.map((a) => (
              <div
                key={a.id}
                className={'sassets-item' + (failedIds.has(a.id) ? ' failed' : '')}
              >
                <div className="sassets-thumb">
                  {a.kind === 'video' ? (
                    <>
                      <video src={a.previewUrl} muted preload="metadata" />
                      <span className="sassets-play" aria-hidden="true">
                        <Play size={14} />
                      </span>
                    </>
                  ) : brokenIds.has(a.id) ? (
                    <span className="sassets-thumb-fallback">{badgeLabel(a)}</span>
                  ) : (
                    <img
                      src={a.previewUrl}
                      alt={a.filename}
                      loading="lazy"
                      onError={() =>
                        setBrokenIds((prev) => new Set(prev).add(a.id))
                      }
                    />
                  )}
                  <span className="sassets-badge">{badgeLabel(a)}</span>
                  <button
                    type="button"
                    className="sassets-dl"
                    title={`Download ${a.filename}`}
                    aria-label={`Download ${a.filename}`}
                    onClick={() => void onDownloadOne(a)}
                  >
                    <Download size={13} />
                  </button>
                </div>
                <div className="sassets-caption">
                  <span className="sassets-name" title={a.url ?? a.filename}>
                    {a.filename}
                  </span>
                  <span className="sassets-meta">
                    {a.width != null && a.height != null
                      ? `${a.width}×${a.height}`
                      : ''}
                    {a.usageCount > 1 ? ` ×${a.usageCount}` : ''}
                    {failedIds.has(a.id) ? ' · opened in tab' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
