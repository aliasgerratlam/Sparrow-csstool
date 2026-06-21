import { useCssInspection } from '@/hooks/use-css-inspection'
import { AppliedBlock } from './AppliedBlock'
import { RuleBlock } from './RuleBlock'

/* The single inspector view: matched CSS rules (or Tailwind utilities). */
export function CssRulesView({ element }: { element: Element | null }) {
  const vm = useCssInspection(element)
  if (!vm) return null

  const { tailwind, plain, crossOrigin } = vm

  return (
    <>
      {tailwind && (
        <>
          <div className="css-section-title">Tailwind classes:</div>
          <div className="tw-class-list">
            {tailwind.classes.map((cls, i) => (
              <span key={i} className="tw-class">
                {cls}
              </span>
            ))}
          </div>
          {(tailwind.otherBase.length > 0 || tailwind.otherMedia.length > 0) && (
            <>
              <div className="css-section-title">Other applied CSS:</div>
              <AppliedBlock
                decls={tailwind.otherBase}
                media={tailwind.otherMedia}
              />
            </>
          )}
        </>
      )}

      {plain && (
        <>
          {plain.empty && (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              No author CSS rules matched for this element.
            </div>
          )}

          {plain.appliedBlocks.map((b) => (
            <RuleBlock key={b.key} block={b} />
          ))}
          {plain.stateBlocks.map((b) => (
            <RuleBlock key={b.key} block={b} />
          ))}

          {plain.pseudoBlocks.length > 0 && (
            <>
              <div className="css-section-title">Pseudo-elements</div>
              {plain.pseudoBlocks.map((b) => (
                <RuleBlock key={b.key} block={b} />
              ))}
            </>
          )}

          {plain.inactiveBlocks.length > 0 && (
            <>
              <div className="css-section-title">
                Conditional (inactive @media):
              </div>
              {plain.inactiveBlocks.map((b) => (
                <RuleBlock key={b.key} block={b} />
              ))}
            </>
          )}

          {plain.resetCount > 0 && (
            <div className="reset-note">
              + {plain.resetCount} base/reset rule
              {plain.resetCount > 1 ? 's' : ''} hidden (UA / framework preflight)
            </div>
          )}
        </>
      )}

      {crossOrigin.map((item, i) => (
        <div key={i} className="css-rule-entry cross-origin-warning">
          ⚠ Cross-origin stylesheet (rules unreadable): {item.href}
        </div>
      ))}
    </>
  )
}
