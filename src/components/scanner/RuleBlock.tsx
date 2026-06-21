import type { RenderBlock } from '@/hooks/use-css-inspection'

const VARIANT_CLASS: Record<RenderBlock['variant'], string> = {
  applied: '',
  inline: '',
  state: ' is-state',
  pseudo: ' is-pseudo',
  inactive: ' rule-conditional',
}

/* DevTools-style rule block: selector { decl; … } with cascade strike-through. */
export function RuleBlock({ block }: { block: RenderBlock }) {
  return (
    <div className={'rule-block' + VARIANT_CLASS[block.variant]}>
      {block.mediaNote && <div className="applied-mq">{block.mediaNote}</div>}
      <div className="rule-head">
        <span className="rule-selector">{block.heading}</span>
        {block.badge && (
          <span className="rule-state-badge">{block.badge}</span>
        )}
        <span className="rule-src">{block.source}</span>
      </div>
      <div className="rule-brace">{'{'}</div>
      {block.decls.map((d, i) => (
        <div
          key={i}
          className={'rule-prop-row' + (d.overridden ? ' decl-overridden' : '')}
        >
          <span className="decl-key">{d.property}</span>
          <span className="decl-colon">:</span>{' '}
          {d.swatch && (
            <span className="decl-swatch" style={{ background: d.swatch }} />
          )}
          <span className="decl-value">{d.value}</span>
          <span className="decl-semi">;</span>
        </div>
      ))}
      <div className="rule-brace">{'}'}</div>
    </div>
  )
}
