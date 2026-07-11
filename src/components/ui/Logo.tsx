import logoUrl from '@/assets/sparoww-logo.png'

type LogoProps = {
  className?: string
  /** Rendered height in px; width scales to keep the wordmark's aspect ratio. */
  height?: number
  /** Rendered width in px (overrides height); height scales to keep aspect. */
  width?: number
  /** Show only the bird mark (crop out the built-in "Sparrow" text). */
  mark?: boolean
  title?: string
}

// Source PNG is 1361×576: the blue bird occupies the left edge, the "Sparrow"
// text fills the rest. These bounds crop to the bird alone for `mark` lockups.
const MARK = { left: 55, width: 485, full: 1361, height: 576 }

/* Shared Sparoww brand wordmark. The source asset is a wide logo with its own
   background, so it's displayed as a rounded chip. Pass `height` for horizontal
   chrome, or `width` for narrow columns (e.g. the mode rail). Pass `mark` to
   render just the bird (used in lockups that add their own "Sparrow" text). */
export function Logo({ className, height = 20, width, mark = false, title = 'Sparoww' }: LogoProps) {
  if (mark) {
    const scale = height / MARK.height
    return (
      <span
        className="inline-block overflow-hidden align-middle"
        style={{ height, width: MARK.width * scale }}
      >
        <img
          src={logoUrl}
          alt={title}
          title={title}
          draggable={false}
          className={['sparoww-logo', className].filter(Boolean).join(' ')}
          style={{
            height,
            width: MARK.full * scale,
            maxWidth: 'none',
            marginLeft: -MARK.left * scale,
          }}
        />
      </span>
    )
  }

  const style = width != null ? { width } : { height }
  return (
    <img
      src={logoUrl}
      alt={title}
      title={title}
      draggable={false}
      className={['sparoww-logo', className].filter(Boolean).join(' ')}
      style={style}
    />
  )
}

export { logoUrl }
