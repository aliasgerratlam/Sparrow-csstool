import { useMemo } from 'react'
import {
  cascadeSort,
  collapseBorderLonghands,
  getMatchedRules,
  stateIsPseudoEl,
} from '@/lib/cssom'
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
  seen: Set<string> | null,
): RenderDecl[] {
  return decls.map((d) => {
    let overridden = false
    if (seen) {
      if (seen.has(d.property)) overridden = true
      else seen.add(d.property)
    }
    return {
      property: d.property,
      value: d.value,
      overridden,
      swatch: extractSwatchColor(d.value),
    }
  })
}

function blockFromRule(
  rule: MatchedRule,
  seen: Set<string> | null,
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
    decls: toDecls(rule.declarations, seen),
  }
}

export function useCssInspection(
  element: Element | null,
): CssRulesViewModel | null {
  return useMemo(() => {
    if (!element) return null
    const rules = getMatchedRules(element)
    const twClasses = getTailwindClasses(element)
    const crossOrigin = rules.filter(
      (r): r is CrossOriginRule => r.type === 'cross-origin',
    )

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

    const seen = new Set<string>()
    const appliedBlocks: RenderBlock[] = []

    if (hasInline) {
      const inlineDecls: { property: string; value: string }[] = []
      for (let i = 0; i < inlineEl.style.length; i++) {
        const prop = inlineEl.style[i] as string
        inlineDecls.push({
          property: prop,
          value: inlineEl.style.getPropertyValue(prop),
        })
      }
      appliedBlocks.push({
        key: 'inline',
        heading: 'element.style',
        badge: null,
        source: 'inline',
        variant: 'inline',
        mediaNote: null,
        decls: toDecls(collapseBorderLonghands(inlineDecls), seen),
      })
    }

    appliedRules.forEach((r) =>
      appliedBlocks.push(blockFromRule(r, seen, 'applied', false, null)),
    )

    const stateBlocks = stateRules.map((r) =>
      blockFromRule(r, null, 'state', true, null),
    )
    const pseudoBlocks = pseudoRules.map((r) =>
      blockFromRule(r, null, 'pseudo', true, null),
    )
    const inactiveBlocks = inactiveMedia.map((r) =>
      blockFromRule(
        r,
        null,
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
  }, [element])
}
