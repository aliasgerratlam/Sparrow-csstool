import { useEffect, useMemo, useState } from 'react'
import {
  cascadeSort,
  collapseBorderLonghands,
  getMatchedRules,
  stateIsPseudoEl,
} from '@/lib/cssom'
import {
  ensureCrossOriginLoaded,
  subscribeCrossOrigin,
} from '@/lib/cross-origin-css'
import { buildAppliedCSS, getTailwindClasses } from '@/lib/tailwind'
import { extractSwatchColor } from '@/lib/extractors'
import type {
  AppliedDeclaration,
  AppliedMediaGroup,
  CrossOriginRule,
  MatchedRule,
} from '@/lib/types'

export interface RenderDecl {
  property: string
  value: string
  overridden: boolean
  swatch: string | null
}

export interface RenderBlock {
  key: string
  heading: string
  badge: string | null
  source: string
  variant: 'applied' | 'state' | 'pseudo' | 'inactive' | 'inline'
  mediaNote: string | null
  decls: RenderDecl[]
}

export interface TailwindView {
  classes: string[]
  otherBase: AppliedDeclaration[]
  otherMedia: AppliedMediaGroup[]
}

export interface PlainView {
  empty: boolean
  appliedBlocks: RenderBlock[] // inline + applied rules, winning first
  stateBlocks: RenderBlock[]
  pseudoBlocks: RenderBlock[]
  inactiveBlocks: RenderBlock[]
  resetCount: number
}

export interface CssRulesViewModel {
  crossOrigin: CrossOriginRule[]
  tailwind: TailwindView | null
  plain: PlainView | null
}

function toDecls(
  decls: { property: string; value: string }[],
): RenderDecl[] {
  return decls.map((d) => ({
    property: d.property,
    value: d.value,
    overridden: false,
    swatch: extractSwatchColor(d.value),
  }))
}

function blockFromRule(
  rule: MatchedRule,
  variant: RenderBlock['variant'],
  stateHeading: boolean,
  mediaNote: string | null,
): RenderBlock {
  const heading = stateHeading && rule.state ? rule.state : rule.selector
  const badge = stateHeading ? null : rule.state
  return {
    key: `${variant}-${rule.order}`,
    heading,
    badge,
    source: rule.source || '',
    variant,
    mediaNote,
    decls: toDecls(rule.declarations),
  }
}

const IMPORTANT_RE = /!\s*important\s*$/i

/* Mark losing declarations across the applied blocks. Blocks arrive in
   descending cascade order (inline first, then winner-first author rules), and
   `!important` inverts the plain cascade: author !important beats non-important
   inline style; inline !important beats everything. Within a rank the first
   declaration encountered (highest cascade) wins. */
function markOverridden(appliedBlocks: RenderBlock[]): void {
  const rankOf = (inline: boolean, important: boolean) =>
    important ? (inline ? 0 : 1) : inline ? 2 : 3
  const best = new Map<string, { rank: number; decl: RenderDecl }>()
  appliedBlocks.forEach((b) => {
    const inline = b.variant === 'inline'
    b.decls.forEach((d) => {
      const rank = rankOf(inline, IMPORTANT_RE.test(d.value))
      const cur = best.get(d.property)
      if (!cur || rank < cur.rank) best.set(d.property, { rank, decl: d })
    })
  })
  appliedBlocks.forEach((b) =>
    b.decls.forEach((d) => {
      d.overridden = best.get(d.property)?.decl !== d
    }),
  )
}

export function useCssInspection(
  element: Element | null,
): CssRulesViewModel | null {
  // Re-run the inspection when the window is resized across a breakpoint —
  // the element reference doesn't change, but @media activity does, and a
  // frozen panel would otherwise keep showing the stale applied/inactive split.
  const [mediaVersion, setMediaVersion] = useState(0)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(t)
      t = setTimeout(() => setMediaVersion((v) => v + 1), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Re-run once cross-origin stylesheets have been re-fetched, so the
  // "unreadable" cards get replaced by their recovered rules.
  const [crossVersion, setCrossVersion] = useState(0)
  useEffect(
    () => subscribeCrossOrigin(() => setCrossVersion((v) => v + 1)),
    [],
  )

  return useMemo(() => {
    if (!element) return null
    const rules = getMatchedRules(element)
    const twClasses = getTailwindClasses(element)
    const crossOrigin = rules.filter(
      (r): r is CrossOriginRule => r.type === 'cross-origin',
    )
    // Unreadable sheets present — ask the recovery loader to
    // re-fetch them; it fires `subscribeCrossOrigin` when done, bumping
    // `crossVersion` and re-running this memo with the recovered rules.
    if (crossOrigin.length) ensureCrossOriginLoaded()

    if (twClasses.length) {
      const applied = buildAppliedCSS(element, rules)
      return {
        crossOrigin,
        tailwind: {
          classes: twClasses,
          otherBase: applied.base.filter((d) => !d.fromTailwind),
          otherMedia: applied.media,
        },
        plain: null,
      }
    }

    const authorRules = rules.filter(
      (r): r is MatchedRule => r.type === 'rule' && !r.isReset,
    )
    const appliedRules = cascadeSort(
      authorRules.filter(
        (r) => !r.state && (!r.mediaCondition || r.mediaActive),
      ),
    ).reverse() // winning rule on top
    const stateRules = authorRules.filter(
      (r) => r.state && !stateIsPseudoEl(r.state),
    )
    const pseudoRules = authorRules.filter((r) => stateIsPseudoEl(r.state))
    const inactiveMedia = authorRules.filter(
      (r) => !r.state && r.mediaCondition && !r.mediaActive,
    )
    const resetCount = rules.filter(
      (r) => r.type === 'rule' && (r as MatchedRule).isReset,
    ).length

    const inlineEl = element as HTMLElement
    const hasInline = !!(inlineEl.style && inlineEl.style.length)

    const appliedBlocks: RenderBlock[] = []

    if (hasInline) {
      const inlineDecls: { property: string; value: string }[] = []
      for (let i = 0; i < inlineEl.style.length; i++) {
        const prop = inlineEl.style[i] as string
        const priority = inlineEl.style.getPropertyPriority(prop)
        inlineDecls.push({
          property: prop,
          value:
            inlineEl.style.getPropertyValue(prop) +
            (priority ? ' !important' : ''),
        })
      }
      appliedBlocks.push({
        key: 'inline',
        heading: 'element.style',
        badge: null,
        source: 'inline',
        variant: 'inline',
        mediaNote: null,
        decls: toDecls(collapseBorderLonghands(inlineDecls)),
      })
    }

    appliedRules.forEach((r) =>
      appliedBlocks.push(blockFromRule(r, 'applied', false, null)),
    )
    markOverridden(appliedBlocks)

    const stateBlocks = stateRules.map((r) =>
      blockFromRule(r, 'state', true, null),
    )
    const pseudoBlocks = pseudoRules.map((r) =>
      blockFromRule(r, 'pseudo', true, null),
    )
    const inactiveBlocks = inactiveMedia.map((r) =>
      blockFromRule(
        r,
        'inactive',
        false,
        '@media ' + r.mediaCondition + ' (inactive)',
      ),
    )

    const empty =
      !appliedBlocks.length &&
      !stateBlocks.length &&
      !pseudoBlocks.length &&
      !inactiveBlocks.length &&
      !crossOrigin.length

    return {
      crossOrigin,
      tailwind: null,
      plain: {
        empty,
        appliedBlocks,
        stateBlocks,
        pseudoBlocks,
        inactiveBlocks,
        resetCount,
      },
    }
  }, [element, mediaVersion, crossVersion])
}
