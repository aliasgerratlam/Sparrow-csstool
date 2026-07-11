import type { Declaration, MatchedRule, RuleResult } from './types'
import { getReadableSheet } from './cross-origin-css'

/* ─────────────────────────────────────────────────────────────────────────
   CSSOM traversal — find the author rules that match an element, attribute
   specificity/state, and serialize declarations the way DevTools shows them.
───────────────────────────────────────────────────────────────────────── */

// Dynamic state pseudo-classes — can't be satisfied by element.matches() at
// rest, so a selector needing one applies only *conditionally*.
const STATE_PSEUDO_RE =
  /:(?:hover|active|focus|focus-within|focus-visible|visited|target|target-within|checked|indeterminate|default|disabled|enabled|read-only|read-write|placeholder-shown|autofill|valid|invalid|required|optional|in-range|out-of-range|user-invalid|user-valid)\b/gi
// Pseudo-elements — styling a sub-box (::before/::after/…), not the element.
const PSEUDO_EL_RE =
  /::?(?:before|after|placeholder|selection|first-line|first-letter|marker|backdrop|file-selector-button)\b/gi
// Non-global variant for one-off classification (avoids stateful lastIndex).
const PSEUDO_EL_NAME_RE =
  /(?:before|after|placeholder|selection|first-line|first-letter|marker|backdrop|file-selector-button)\b/i

export function stateIsPseudoEl(state: string | null): boolean {
  return !!state && PSEUDO_EL_NAME_RE.test(state)
}

interface SelectorMatch {
  matched: boolean
  state: string
}

// Classify one comma-separated selector part against the element.
// `state` is the pseudo suffix that had to be removed before it matched.
export function classifySelectorPart(
  element: Element,
  sel: string,
): SelectorMatch {
  try {
    if (element.matches(sel)) return { matched: true, state: '' }
  } catch {
    /* fall through */
  }
  const states: string[] = []
  const base = sel
    .replace(STATE_PSEUDO_RE, (m) => {
      states.push(m)
      return ''
    })
    .replace(PSEUDO_EL_RE, (m) => {
      states.push(m)
      return ''
    })
    .replace(/\(\s*\)/g, '') // tidy any emptied :not()/:is() shells
    .trim()
  if (!base || base === sel) return { matched: false, state: '' }
  try {
    if (element.matches(base)) return { matched: true, state: states.join('') }
  } catch {
    /* no */
  }
  return { matched: false, state: '' }
}

// A selector is a UA/framework reset if it targets nothing by class/id/attr.
export function isResetSelector(sel: string): boolean {
  return !/[.#[]/.test(sel)
}

// Trim a long content-hashed basename to `head…tail.ext` so it stays readable
// without blowing out the panel (the full href is still on the tooltip).
function shortenBasename(name: string): string {
  if (name.length <= 24) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const stem = dot > 0 ? name.slice(0, dot) : name
  if (stem.length <= 16) return name
  return `${stem.slice(0, 8)}…${stem.slice(-4)}${ext}`
}

function sheetLabel(sheet: CSSStyleSheet | null): string {
  if (!sheet) return '<style>'
  if (sheet.href) {
    try {
      // Take just the filename — drop the directory, the query string (e.g. a
      // `?dpl=…` deployment/cache-busting token) and any hash.
      const url = new URL(sheet.href)
      const base = url.pathname.split('/').pop() || url.hostname
      return shortenBasename(base)
    } catch {
      // Non-absolute or unparseable href — best-effort strip of ?query/#hash.
      const base = sheet.href.split(/[?#]/)[0]?.split('/').pop()
      return base ? shortenBasename(base) : sheet.href
    }
  }
  return '<style>'
}

function safeMatchMedia(cond: string): boolean {
  try {
    return window.matchMedia(cond).matches
  } catch {
    return true
  }
}

function splitDeclarationBlock(text: string): Declaration[] {
  const result: Declaration[] = []
  let depth = 0 // parenthesis nesting — rgba(), url(), calc()
  let inString = false
  let stringChar = ''
  let buf = ''
  const flush = () => {
    const decl = buf.trim()
    buf = ''
    if (!decl) return
    const idx = decl.indexOf(':')
    if (idx === -1) return
    const property = decl.slice(0, idx).trim()
    const value = decl.slice(idx + 1).trim()
    if (property && value) result.push({ property, value })
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (inString) {
      buf += ch
      if (ch === stringChar && text[i - 1] !== '\\') inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      buf += ch
      continue
    }
    if (ch === '(') {
      depth++
      buf += ch
      continue
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1)
      buf += ch
      continue
    }
    if (ch === ';' && depth === 0) {
      flush()
      continue
    }
    buf += ch
  }
  flush()
  return result
}

// Chrome serializes `border: none` as four longhands; recollapse that exact
// quartet back into a single `border:` line, matching DevTools.
export function collapseBorderLonghands(decls: Declaration[]): Declaration[] {
  const idx: Record<string, number> = {}
  decls.forEach((d, i) => {
    idx[d.property] = i
  })
  const need = ['border-width', 'border-style', 'border-color', 'border-image']
  if (!need.every((p) => p in idx)) return decls
  const get = (p: string) => decls[idx[p] as number]?.value ?? ''
  const style = get('border-style')
  const width = get('border-width')
  const color = get('border-color')
  let value: string
  if (style === 'none' || style === 'hidden') {
    value = style === 'hidden' ? 'hidden' : 'none'
  } else {
    value =
      [width, style, color]
        .filter((v) => v && v !== 'medium' && v !== 'currentcolor')
        .join(' ') || style
  }
  const firstPos = Math.min(...need.map((p) => idx[p] as number))
  const out = decls.filter((d) => !need.includes(d.property))
  out.splice(firstPos, 0, { property: 'border', value })
  return out
}

// Parse the serialized declaration block (cssText) rather than iterating
// style[i] — the latter expands shorthands into noisy longhands.
function parseDeclarations(style: CSSStyleDeclaration): Declaration[] {
  if (!style || !style.cssText) return []
  return collapseBorderLonghands(splitDeclarationBlock(style.cssText))
}

export function getSpecificity(selector: string): number {
  // Strip content inside :not(), :is(), etc. to avoid double-counting.
  const s = selector.replace(/:[\w-]+\([^)]*\)/g, '')
  const ids = (s.match(/#[\w-]+/g) || []).length
  const classes = (s.match(/[.:[][^:{.[#\s>+~*]+/g) || []).length
  const tags = (s.match(/(^|[\s>+~])[\w-]+/g) || []).length
  return ids * 100 + classes * 10 + tags
}

function traverseRuleList(
  ruleList: CSSRuleList | undefined,
  element: Element,
  mediaCondition: string | null,
  sheet: CSSStyleSheet | null,
  results: RuleResult[],
  order: number,
): number {
  if (!ruleList) return order
  for (const rule of Array.from(ruleList)) {
    if (rule.type === 1) {
      // CSSStyleRule
      const styleRule = rule as CSSStyleRule
      const parts = styleRule.selectorText.split(',').map((s) => s.trim())
      const hits: { sel: string; state: string }[] = []
      for (const sel of parts) {
        const { matched, state } = classifySelectorPart(element, sel)
        if (matched) hits.push({ sel, state })
      }
      if (hits.length) {
        const resting = hits.find((h) => !h.state)
        const chosen = resting || (hits[0] as { sel: string; state: string })
        const matchedSel = hits.map((h) => h.sel).join(', ')
        results.push({
          type: 'rule',
          selector: matchedSel,
          fullSelector: styleRule.selectorText,
          declarations: parseDeclarations(styleRule.style),
          cssText: styleRule.cssText,
          mediaCondition,
          mediaActive: mediaCondition ? safeMatchMedia(mediaCondition) : true,
          state: chosen.state || null,
          isReset: hits.every((h) => isResetSelector(h.sel)),
          specificity: getSpecificity(chosen.sel),
          order: order++,
          source: sheetLabel(sheet),
        })
      }
    } else if (rule.type === 4) {
      // CSSMediaRule
      const mediaRule = rule as CSSMediaRule
      order = traverseRuleList(
        mediaRule.cssRules,
        element,
        mediaRule.conditionText,
        sheet,
        results,
        order,
      )
    } else if (rule.type === 12) {
      // CSSSupportsRule
      const supRule = rule as CSSSupportsRule
      order = traverseRuleList(
        supRule.cssRules,
        element,
        '@supports ' + supRule.conditionText,
        sheet,
        results,
        order,
      )
    }
  }
  return order
}

export function getMatchedRules(element: Element): RuleResult[] {
  const results: RuleResult[] = []
  let order = 0
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      order = traverseRuleList(
        sheet.cssRules,
        element,
        null,
        sheet,
        results,
        order,
      )
    } catch {
      // Cross-origin sheet: the browser won't let us read its rules. In the
      // extension build a re-fetched, readable copy may exist — traverse that
      // instead. The recovered sheet is constructable (no href of its own), so
      // pass a stand-in carrying the original href for source labeling.
      const recovered = getReadableSheet(sheet.href)
      if (recovered) {
        order = traverseRuleList(
          recovered.cssRules,
          element,
          null,
          { href: sheet.href } as CSSStyleSheet,
          results,
          order,
        )
      } else {
        results.push({ type: 'cross-origin', href: sheet.href || '(unknown)' })
      }
    }
  }
  return results
}

// Cascade order: lower specificity first, ties broken by source order.
export function cascadeSort(rules: MatchedRule[]): MatchedRule[] {
  return rules
    .slice()
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order)
}
