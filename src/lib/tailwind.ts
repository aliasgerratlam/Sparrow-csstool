import { cascadeSort } from './cssom'
import type { AppliedCSS, AppliedDeclaration, MatchedRule, RuleResult } from './types'

/* ─────────────────────────────────────────────────────────────────────────
   Tailwind detection + applied-CSS merge.
───────────────────────────────────────────────────────────────────────── */

// Utility-class prefixes Tailwind generates. Variant prefixes (md:, hover:, …)
// are stripped before matching; arbitrary values (text-[…]) are accepted too.
const TW_PREFIX_SET = new Set([
  'text', 'bg', 'from', 'via', 'to', 'decoration', 'placeholder', 'caret', 'accent', 'fill', 'stroke',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'ms', 'me',
  'w', 'h', 'min', 'max', 'min-w', 'max-w', 'min-h', 'max-h', 'size', 'basis',
  'gap', 'gap-x', 'gap-y', 'space', 'space-x', 'space-y',
  'flex', 'grid', 'grid-cols', 'grid-rows', 'col', 'row', 'order', 'auto-cols', 'auto-rows',
  'items', 'justify', 'content', 'self', 'place', 'place-items', 'place-content', 'place-self',
  'rounded', 'border', 'divide', 'outline', 'ring', 'ring-offset',
  'font', 'leading', 'tracking', 'indent', 'align', 'whitespace', 'break', 'list', 'line-clamp',
  'z', 'top', 'bottom', 'left', 'right', 'inset', 'translate', 'scale', 'rotate', 'skew', 'origin',
  'opacity', 'shadow', 'blur', 'brightness', 'contrast', 'grayscale', 'invert', 'saturate', 'sepia', 'backdrop',
  'overflow', 'overscroll', 'object', 'aspect',
  'cursor', 'select', 'resize', 'scroll', 'snap', 'touch', 'will',
  'transition', 'duration', 'delay', 'ease', 'animate', 'gradient', 'bg-gradient',
])

// Standalone (value-less) utilities + Tailwind marker classes.
const TW_STANDALONE = new Set([
  'block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'contents',
  'flow-root', 'list-item', 'hidden', 'flex-row', 'flex-col', 'flex-wrap', 'flex-nowrap',
  'static', 'fixed', 'absolute', 'relative', 'sticky', 'isolate', 'container', 'group', 'peer',
  'italic', 'not-italic', 'antialiased', 'uppercase', 'lowercase', 'capitalize', 'normal-case',
  'underline', 'overline', 'line-through', 'no-underline', 'truncate', 'visible', 'invisible',
  'collapse', 'sr-only', 'not-sr-only', 'transform', 'grow', 'shrink',
])

export function isTailwindClass(cls: string): boolean {
  if (!cls || cls.startsWith('scanner-')) return false
  let base = cls
  const colon = base.lastIndexOf(':') // strip variant prefix (md:, hover:, …)
  if (colon !== -1) base = base.slice(colon + 1)
  if (base[0] === '-') base = base.slice(1) // negative utility (-mt-4)
  if (!base) return false
  if (TW_STANDALONE.has(base)) return true
  const dash = base.indexOf('-')
  if (dash === -1) return TW_PREFIX_SET.has(base) // bare: border, shadow, rounded
  const seg1 = base.slice(0, dash)
  const seg2 = base.split('-').slice(0, 2).join('-')
  return TW_PREFIX_SET.has(seg1) || TW_PREFIX_SET.has(seg2)
}

export function getTailwindClasses(el: Element): string[] {
  if (!el.classList) return []
  return Array.from(el.classList).filter(isTailwindClass)
}

// A matched rule "came from Tailwind" if its selector is a single class that is
// itself a Tailwind utility (e.g. `.mb-16`, `.md\:grid-cols-3`).
export function isRuleTailwind(rule: MatchedRule): boolean {
  const sel = (rule.selector || '').trim()
  const m = sel.match(/^\.((?:[\w-]|\\.)+)$/)
  if (!m || m[1] === undefined) return false
  const cls = m[1].replace(/\\(.)/g, '$1') // unescape \: \[ \] \. …
  return isTailwindClass(cls)
}

// Merge matched rules into the declarations actually applied, recording the
// source selector for each property. Excludes resets, conditional state rules
// and inactive @media rules.
const IMPORTANT_RE = /!\s*important\s*$/i

export function buildAppliedCSS(element: Element, rules: RuleResult[]): AppliedCSS {
  const baseMap = new Map<string, AppliedDeclaration>()
  const mediaGroups: { condition: string; map: Map<string, AppliedDeclaration> }[] = []
  const mediaIndex = new Map<string, { condition: string; map: Map<string, AppliedDeclaration> }>()

  // Later writes win (cascade order), EXCEPT an !important declaration can only
  // be displaced by another !important one.
  const setDecl = (
    map: Map<string, AppliedDeclaration>,
    decl: AppliedDeclaration,
  ) => {
    const prev = map.get(decl.property)
    if (prev && IMPORTANT_RE.test(prev.value) && !IMPORTANT_RE.test(decl.value))
      return
    map.set(decl.property, decl)
  }

  const applicable = cascadeSort(
    rules.filter(
      (r): r is MatchedRule =>
        r.type === 'rule' &&
        !r.isReset &&
        !r.state &&
        (!r.mediaCondition || r.mediaActive),
    ),
  )

  applicable.forEach((r) => {
    const fromTW = isRuleTailwind(r)
    if (r.mediaCondition) {
      let g = mediaIndex.get(r.mediaCondition)
      if (!g) {
        g = { condition: r.mediaCondition, map: new Map() }
        mediaIndex.set(r.mediaCondition, g)
        mediaGroups.push(g)
      }
      r.declarations.forEach((d) =>
        setDecl(g.map, {
          property: d.property,
          value: d.value,
          fromTailwind: fromTW,
          source: r.selector,
        }),
      )
    } else {
      r.declarations.forEach((d) =>
        setDecl(baseMap, {
          property: d.property,
          value: d.value,
          fromTailwind: fromTW,
          source: r.selector,
        }),
      )
    }
  })

  // Inline styles override everything except author !important (which only an
  // inline !important can beat) and are never "from Tailwind".
  const inlineEl = element as HTMLElement
  if (inlineEl.style && inlineEl.style.length) {
    for (let i = 0; i < inlineEl.style.length; i++) {
      const prop = inlineEl.style[i] as string
      const priority = inlineEl.style.getPropertyPriority(prop)
      setDecl(baseMap, {
        property: prop,
        value:
          inlineEl.style.getPropertyValue(prop) +
          (priority ? ' !important' : ''),
        fromTailwind: false,
        source: 'element.style',
      })
    }
  }

  const toArr = (map: Map<string, AppliedDeclaration>) => Array.from(map.values())
  return {
    base: toArr(baseMap),
    media: mediaGroups.map((g) => ({ condition: g.condition, decls: toArr(g.map) })),
  }
}
