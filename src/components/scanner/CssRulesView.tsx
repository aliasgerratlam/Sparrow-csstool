import { useEffect, useRef, useState } from 'react'
import type { CssRulesViewModel } from '@/hooks/use-css-inspection'
import { copyToClipboard } from '@/lib/clipboard'
import { AppliedBlock } from './AppliedBlock'
import { RuleBlock } from './RuleBlock'

export type InspectTab = 'tw' | 'css'

const COPY_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
)
const CHECK_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12l5 5L20 7" />
  </svg>
)

/* Number of declaration rows the CSS tab will list. */
function countRows(vm: CssRulesViewModel): number {
  let n = 0
  if (vm.tailwind) {
    n += vm.tailwind.otherBase.length
    for (const g of vm.tailwind.otherMedia) n += g.decls.length
  }
  if (vm.plain) {
    const blocks = [
      ...vm.plain.appliedBlocks,
      ...vm.plain.stateBlocks,
      ...vm.plain.pseudoBlocks,
      ...vm.plain.inactiveBlocks,
    ]
    for (const b of blocks) n += b.decls.length
  }
  return n
}

/* Tailwind utilities as copyable chips — tap one to copy just that class. */
function TailwindChips({ classes }: { classes: string[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
  const copyOne = (cls: string, i: number) => {
    void copyToClipboard(cls).then((ok) => {
      if (!ok) return
      setCopiedIdx(i)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopiedIdx(null), 1200)
    })
  }
  return (
    <div className="sp-ip-chips">
      {classes.map((cls, i) => (
        <button
          key={i}
          type="button"
          className={
            'sp-ip-btn sp-ip-chip' +
            (cls.includes('[') ? ' is-arbitrary' : '') +
            (copiedIdx === i ? ' is-copied' : '')
          }
          title={`Copy ${cls}`}
          onClick={() => copyOne(cls, i)}
        >
          {cls}
        </button>
      ))}
    </div>
  )
}

/* The inspector body for the active tab: Tailwind utility chips, or the matched
   CSS as one list (winner first, losers struck through). The view model is
   computed by the parent (InspectorPanel) so the color-format toggle can be
   shown/hidden from the same data without inspecting twice. */
export function CssRulesView({
  vm,
  tab,
  title,
  onCopy,
  copied,
}: {
  vm: CssRulesViewModel | null
  tab: InspectTab
  /** Element label shown at the head of the CSS box (e.g. `button.cta`). */
  title: string
  onCopy: () => void
  copied: boolean
}) {
  if (!vm) return null

  const { tailwind, plain, crossOrigin } = vm
  const rows = countRows(vm)

  const crossOriginNotes = crossOrigin.map((item, i) => (
    <div key={i} className="sp-ip-warn">
      Cross-origin stylesheet (rules unreadable): {item.href}
    </div>
  ))

  if (tab === 'tw' && tailwind) {
    return (
      <>
        <TailwindChips classes={tailwind.classes} />
        {crossOriginNotes}
      </>
    )
  }

  const noRules = rows === 0

  return (
    <>
      <div className="sp-ip-box">
        <div className="sp-ip-box-head">
          <span className="sp-ip-box-title" title={title}>
            {title}
          </span>
          <span className="sp-ip-box-count">
            {rows} {rows === 1 ? 'rule' : 'rules'}
          </span>
          {rows > 0 && (
            <button
              type="button"
              className={'sp-ip-btn sp-ip-minicopy' + (copied ? ' is-done' : '')}
              aria-label="Copy CSS"
              onClick={onCopy}
            >
              {copied ? CHECK_ICON : COPY_ICON}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>

        <div className="sp-ip-box-body">
          {noRules && (
            <div className="sp-ip-empty">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              {tailwind
                ? 'No other author CSS applies to this element.'
                : 'No author CSS rules matched for this element.'}
            </div>
          )}

          {tailwind && (
            <AppliedBlock
              decls={tailwind.otherBase}
              media={tailwind.otherMedia}
            />
          )}

          {plain && (
            <>
              {plain.appliedBlocks.map((b) => (
                <RuleBlock key={b.key} block={b} />
              ))}
              {plain.stateBlocks.map((b) => (
                <RuleBlock key={b.key} block={b} />
              ))}

              {plain.pseudoBlocks.length > 0 && (
                <>
                  <div className="sp-ip-group">Pseudo-elements</div>
                  {plain.pseudoBlocks.map((b) => (
                    <RuleBlock key={b.key} block={b} />
                  ))}
                </>
              )}

              {plain.inactiveBlocks.length > 0 && (
                <>
                  <div className="sp-ip-group">Conditional (inactive @media)</div>
                  {plain.inactiveBlocks.map((b) => (
                    <RuleBlock key={b.key} block={b} />
                  ))}
                </>
              )}

              {plain.resetCount > 0 && (
                <div className="sp-ip-note">
                  + {plain.resetCount} base/reset rule
                  {plain.resetCount > 1 ? 's' : ''} hidden (UA / framework
                  preflight)
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {crossOriginNotes}
    </>
  )
}
