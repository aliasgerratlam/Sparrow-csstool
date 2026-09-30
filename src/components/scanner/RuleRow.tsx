/* One declaration row of the inspector's CSS list: `prop: value;` on the left,
   where it came from on the right (a selector / file, optionally with a
   :hover-style badge). Losing declarations are struck through and dimmed. */
export function RuleRow({
  prop,
  value,
  swatch,
  badge,
  source,
  sourceTitle,
  overridden = false,
  dim = false,
  indent = false,
}: {
  prop: string
  value: string
  swatch?: string | null
  badge?: string | null
  source?: string
  sourceTitle?: string
  overridden?: boolean
  dim?: boolean
  indent?: boolean
}) {
  return (
    <div
      className={
        'sp-ip-row' +
        (overridden ? ' is-overridden' : '') +
        (dim ? ' is-dim' : '') +
        (indent ? ' is-indent' : '')
      }
    >
      <div className="sp-ip-row-decl">
        <span className="sp-ip-prop">{prop}</span>
        {': '}
        {swatch && (
          <span
            className="sp-ip-swatch"
            style={{ background: swatch }}
            aria-hidden="true"
          />
        )}
        {value};
      </div>
      {(badge || source) && (
        <div className="sp-ip-row-src">
          {badge && <span className="sp-ip-badge">{badge}</span>}
          {source && (
            <span className="sp-ip-src-text" title={sourceTitle ?? source}>
              {source}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
