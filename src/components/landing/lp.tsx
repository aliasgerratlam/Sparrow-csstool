import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/format'

/* Shared building blocks for the redesigned landing page (Claude Design
   "Sparrow website redesign"). Sections are written once, mobile-first, and
   switch to the desktop composition at `lg`. */

/** Page gutter: 1200px of content inside a 1264px max (32px gutters). */
export function LpContainer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1264px] px-5 md:px-8', className)}>
      {children}
    </div>
  )
}

/** Stacked (sub-lg) section bodies cap at a readable column on tablets. */
export const STACK = 'mx-auto w-full max-w-[640px] lg:max-w-none'

export function SectionBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-lp-blue/10 px-3 py-1.5 text-xs font-medium text-lp-blue-700 md:text-[13px]">
      {children}
    </span>
  )
}

export function SectionHeading({
  id,
  children,
  className,
}: {
  id?: string
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      id={id}
      className={cn(
        'mt-3.5 text-center text-[32px] leading-[38px] font-semibold tracking-[-0.03em] text-lp-ink md:mt-4 md:text-[40px] md:leading-[48px] lg:text-5xl lg:leading-[56px]',
        className,
      )}
    >
      {children}
    </h2>
  )
}

/* ─── icons: the design's 24×24 stroke set ─── */

const ICON_PATHS = {
  inspect: <path d="M4 4l7 17 2.5-7.5L21 11z" />,
  annotate: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  ruler: (
    <>
      <rect x="2" y="8" width="20" height="8" rx="2" />
      <path d="M6 8v3M10 8v4M14 8v3M18 8v4" />
    </>
  ),
  colors: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.7-1.8 0-1.3-1-1.6-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="11" cy="7" r="1" />
      <circle cx="16" cy="8.5" r="1" />
    </>
  ),
  fonts: <path d="M4 20L10 4l6 16M6.5 14h7M17 20v-6a2.5 2.5 0 0 1 5 0v6M17 17h5" />,
  fontsSm: <path d="M4 20L10 4l6 16M6.5 14h7" />,
  assets: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  check: <path d="M5 12l5 5L20 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 16.5 5.5 21l2-7.5L2 9h7z" />,
  menu: <path d="M4 8h16M4 16h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
} as const

export type IconName = keyof typeof ICON_PATHS

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

/** Four-point sparkle (the twinkling accents around the hero headline). */
export function Sparkle({
  className,
  fill,
  style,
}: {
  className?: string
  fill: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z" fill={fill} />
    </svg>
  )
}

/** Numbered annotation pin — the round-with-a-corner speech bubble. */
export function Pin({
  n,
  className,
}: {
  n: number | string
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-[9999px_9999px_9999px_4px] font-semibold',
        className,
      )}
    >
      {n}
    </span>
  )
}

/* ─── the six-tool demo shared by both hero product windows ─── */

export const TOOLS = [
  { id: 'inspect', name: 'Inspect', hint: 'Hover any element to see the CSS that shaped it.' },
  { id: 'annotate', name: 'Annotate', hint: 'Drop a numbered pin and share one link.' },
  { id: 'ruler', name: 'Ruler', hint: 'Anchor an element, hover another, read the distance.' },
  { id: 'colors', name: 'Colors', hint: 'Every color on the page, sorted by usage.' },
  { id: 'fonts', name: 'Fonts', hint: 'Audit typefaces and preview a swap instantly.' },
  { id: 'assets', name: 'Assets', hint: 'Every image, SVG and video, ready to download.' },
] as const

export type ToolId = (typeof TOOLS)[number]['id']

/** Steps through the six tools until the visitor picks one (and not at all
 *  under prefers-reduced-motion). */
export function useToolCycle(intervalMs = 2600) {
  const [tool, setTool] = useState<ToolId>('inspect')
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    if (!auto) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => {
      setTool((cur) => {
        const i = TOOLS.findIndex((x) => x.id === cur)
        return TOOLS[(i + 1) % TOOLS.length]?.id ?? cur
      })
    }, intervalMs)
    return () => window.clearInterval(t)
  }, [auto, intervalMs])

  const pick = (id: ToolId) => {
    setAuto(false)
    setTool(id)
  }
  return { tool, pick }
}

/** Renders a fixed-size (`width`×`height`) composition scaled down to fit its
 *  parent — the desktop product window is pixel-positioned, so narrower
 *  viewports shrink it instead of reflowing. Never scales up. */
export function ScaledStage({
  width,
  height,
  className,
  children,
}: {
  width: number
  height: number
  className?: string
  children: ReactNode
}) {
  const outer = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const measure = () => setScale(Math.min(1, el.clientWidth / width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  return (
    <div
      ref={outer}
      className={cn('w-full', className)}
      style={{ height: height * scale }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** The design's brand tile: a blue rounded square with the white sparrow. */
export function BrandMark({
  size = 34,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-lp-blue',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
      }}
    >
      <svg
        width={Math.round(size * 0.59)}
        height={Math.round(size * 0.59)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 14c3 0 5-2 6-5 1 3 4 5 8 5-2 3-5 5-8 5-3 0-5-2-6-5z" />
        <path d="M14 7l3-3" />
      </svg>
    </span>
  )
}
