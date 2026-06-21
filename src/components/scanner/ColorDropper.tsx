import { useEffect, useRef, useState } from 'react'
import { Pipette, Copy, Check } from 'lucide-react'
import { copyToClipboard } from '@/lib/clipboard'
import { formatHex, formatRgba, formatHsl, rgbToHsl } from '@/lib/color'
import { useDraggable } from '@/hooks/use-draggable'

// The native EyeDropper API (Chrome/Edge/Opera) isn't in the DOM lib types yet.
interface EyeDropperResult {
  sRGBHex: string
}
interface EyeDropperConstructor {
  new (): { open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult> }
}
declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor
  }
}

interface ColorValue {
  hex: string
  rgba: string
  hsl: string
}

/** Parse a `#rrggbb` string (the EyeDropper API's `sRGBHex`) into channels. */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '')
  if (m.length !== 6) return null
  const n = parseInt(m, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toColorValue(r: number, g: number, b: number, a: number): ColorValue {
  const { h, s, l } = rgbToHsl(r, g, b)
  return {
    hex: formatHex(r, g, b),
    rgba: formatRgba(r, g, b, a),
    hsl: formatHsl(h, s, l),
  }
}

// ── Firefox/Safari fallback (no native EyeDropper) ──────────────────────────
// Scanner chrome to ignore while hovering, so the panel itself isn't sampled.
const SCANNER_UI = ['#scanner-toolbar', '#mode-rail', '#scanner-dropper-panel', '#cta-btn']
function isScannerUI(el: Element | null): boolean {
  return !!el?.closest && SCANNER_UI.some((sel) => el.closest(sel))
}

/** Parse a computed `rgb()/rgba()` color into channels (alpha as 0–255). */
function parseRgb(str: string): [number, number, number, number] | null {
  const m = str.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const p = (m[1] ?? '').split(',').map((s) => parseFloat(s.trim()))
  if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null
  return [p[0]!, p[1]!, p[2]!, Math.round((p[3] ?? 1) * 255)]
}

/** Whether the element directly holds visible text (vs. only child elements). */
function hasDirectText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true
  }
  return false
}

/* Read the most meaningful CSS color at a point without sampling pixels:
   - if the element paints its own (opaque) background, that's the surface color;
   - else if it directly holds text, use its text color (so hovering a heading
     gives the heading color, not the page behind it);
   - else climb ancestors to the first opaque background you'd actually see.
   This is exact for declared colors but can't see gradients/images (those read
   as the surface behind them). */
function readCssColorAt(x: number, y: number): ColorValue | null {
  const el = document.elementFromPoint(x, y)
  if (!el || isScannerUI(el)) return null
  const cs = getComputedStyle(el)
  const ownBg = parseRgb(cs.backgroundColor)
  if (ownBg && ownBg[3] > 0) return toColorValue(...ownBg)
  if (hasDirectText(el)) {
    const text = parseRgb(cs.color)
    if (text && text[3] > 0) return toColorValue(...text)
  }
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    const bg = parseRgb(getComputedStyle(cur).backgroundColor)
    if (bg && bg[3] > 0) return toColorValue(...bg)
  }
  return toColorValue(255, 255, 255, 255) // nothing opaque found → page default
}

/* Color Dropper with two paths, chosen by capability:
   • Chromium → the native EyeDropper API. Pixel-perfect, real screen pixels,
     its own magnifier; auto-opens on tool select, re-pick via the button.
   • Firefox/Safari (no EyeDropper) → live computed-style readout: hover an
     element and read its effective CSS color (see readCssColorAt). Exact for
     declared colors, but can't sample gradients/images/arbitrary pixels. */
export function ColorDropper() {
  const [supported] = useState(() => 'EyeDropper' in window)
  const [color, setColor] = useState<ColorValue | null>(null)
  const [picking, setPicking] = useState(false)
  const [copied, setCopied] = useState<keyof ColorValue | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  // Drag the panel by its header so it never sits over a color you want to pick.
  const panelRef = useRef<HTMLDivElement>(null)
  const { pos: dragPos, dragging, onHandlePointerDown } = useDraggable(panelRef)

  // Hand off to the OS-level picker. Resolves with an sRGB hex of the true screen
  // pixel; rejects (AbortError) if the user presses Esc — which we ignore.
  const pick = async () => {
    if (!window.EyeDropper) return
    setPicking(true)
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      const rgb = hexToRgb(sRGBHex)
      if (rgb) setColor(toColorValue(rgb[0], rgb[1], rgb[2], 255))
    } catch {
      /* user cancelled the pick — leave the current readout untouched */
    } finally {
      setPicking(false)
    }
  }

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  // Auto-open the picker the moment the dropper tool is selected — selecting it
  // from the rail is itself a click, so the native API's required user gesture
  // (transient activation) is still valid when this mount effect runs. The ref
  // guard stops StrictMode's dev double-invoke from opening it twice; a real
  // re-select remounts this component (fresh ref), so it re-activates as wanted.
  const didAutoOpen = useRef(false)
  useEffect(() => {
    if (didAutoOpen.current) return
    didAutoOpen.current = true
    if (supported) void pick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Firefox/Safari fallback: no native picker, so read the element's CSS color
  // live on hover (rAF-throttled). Sampling holds when over the panel itself.
  const posRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)
  useEffect(() => {
    if (supported) return
    const onMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY }
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const p = posRef.current
        const c = p && readCssColorAt(p.x, p.y)
        if (c) setColor(c)
      })
    }
    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('mousemove', onMove)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [supported])

  const handleCopy = (key: keyof ColorValue) => {
    if (!color) return
    copyToClipboard(color[key])
    setCopied(key)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(null), 1100)
  }

  const rows: { key: keyof ColorValue; label: string }[] = [
    { key: 'hex', label: 'HEX' },
    { key: 'rgba', label: 'RGBA' },
    { key: 'hsl', label: 'HSL' },
  ]

  const subtitle = !supported
    ? color
      ? 'Live CSS color · hover to scan elements'
      : 'Hover any element to read its color'
    : picking
      ? 'Click any pixel on screen…'
      : color
        ? 'Pick again to sample another color'
        : 'Click Pick, then any pixel on screen'

  return (
    <div
      id="scanner-dropper-panel"
      ref={panelRef}
      className={dragging ? 'dragging' : undefined}
      style={
        dragPos
          ? { top: dragPos.top, left: dragPos.left, right: 'auto', bottom: 'auto' }
          : undefined
      }
    >
      <div id="dropper-head" onPointerDown={onHandlePointerDown}>
        <span className="dropper-icon">
          <Pipette size={16} strokeWidth={2.2} />
        </span>
        <div className="dropper-head-text">
          <span className="dropper-title">Color Dropper</span>
          <span className="dropper-sub">{subtitle}</span>
        </div>
      </div>

      <div className="dropper-body">
        <div
          className="dropper-swatch"
          style={{ background: color?.hex ?? '#111827' }}
        >
          <span className="dropper-swatch-tag">PREVIEW</span>
        </div>
        <div className="dropper-rows">
          {rows.map(({ key, label }) => (
            <div className="dropper-row" key={key}>
              <span className="dropper-row-label">{label}</span>
              <span className="dropper-row-value">{color?.[key] ?? '—'}</span>
              <button
                type="button"
                className="dropper-copy"
                aria-label={`Copy ${label}`}
                disabled={!color}
                onClick={() => handleCopy(key)}
              >
                {copied === key ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {supported && (
        <button type="button" id="dropper-pick" onClick={pick} disabled={picking}>
          <Pipette size={15} strokeWidth={2.4} />
          {picking ? 'Picking…' : color ? 'Pick again' : 'Pick a color'}
        </button>
      )}
    </div>
  )
}
