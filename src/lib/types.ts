/* ─────────────────────────────────────────────────────────────────────────
   Shared domain types for the CSS Scanner + annotation system.
───────────────────────────────────────────────────────────────────────── */

/* ── CSSOM inspection ─────────────────────────────────────────────────── */

export interface Declaration {
  property: string
  value: string
}

/** A single author CSS rule that matched the inspected element. */
export interface MatchedRule {
  type: 'rule'
  /** Comma-joined list of the selector part(s) that actually matched. */
  selector: string
  /** The full, original `selectorText` of the rule. */
  fullSelector: string
  declarations: Declaration[]
  cssText: string
  /** `@media`/`@supports` condition the rule lives under, or null. */
  mediaCondition: string | null
  /** Whether that condition currently evaluates true. */
  mediaActive: boolean
  /** Pseudo suffix (`:hover`, `::before`, …) that had to be stripped to match. */
  state: string | null
  /** UA/framework reset rule (targets only tags/`*`). */
  isReset: boolean
  specificity: number
  order: number
  source: string
}

/** A stylesheet whose rules could not be read (CORS). */
export interface CrossOriginRule {
  type: 'cross-origin'
  href: string
}

export type RuleResult = MatchedRule | CrossOriginRule

/** One applied declaration, annotated with where it came from. */
export interface AppliedDeclaration extends Declaration {
  fromTailwind: boolean
  source: string
}

export interface AppliedMediaGroup {
  condition: string
  decls: AppliedDeclaration[]
}

export interface AppliedCSS {
  base: AppliedDeclaration[]
  media: AppliedMediaGroup[]
}

export interface Dimensions {
  width: number
  height: number
  viewportTop: number
  viewportLeft: number
  docTop: number
  docLeft: number
  marginTop: string
  marginRight: string
  marginBottom: string
  marginLeft: string
  paddingTop: string
  paddingRight: string
  paddingBottom: string
  paddingLeft: string
  borderTop: string
  borderRight: string
  borderBottom: string
  borderLeft: string
}

/* ── Annotation / review ──────────────────────────────────────────────── */

export type Role = 'author' | 'client'
export type Status = 'Open' | 'Resolved'
export type Category =
  | 'Design'
  | 'Content'
  | 'Development'
  | 'UX'
  | 'Accessibility'
  | 'General'

/** Serializable record locating an element across reloads/shares.

    `primary`/`nthPath`/`id`/`tag` are the original position-based anchor. The
    fields below are optional resilience signals (added later; old records omit
    them) that let `resolve` re-find an element in a DOM that differs from the one
    the record was minted against — e.g. another collaborator's browser at a
    different viewport. See src/lib/selector-engine.ts. */
export interface SelectorRecord {
  primary: string
  nthPath: string
  id: string | null
  tag: string
  /** Positional path built from `:nth-of-type` (survives different-tag siblings). */
  ofTypePath?: string
  /** Whitelisted identifying attributes (normalized). */
  attrs?: Record<string, string>
  /** Normalized, truncated text fingerprint of the element. */
  text?: string
}

export interface AnnotationStyling {
  fontSize: string
  fontFamily: string
  fontWeight: string
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  background: string
}

export interface Reply {
  id: string
  author: string
  message: string
  createdAt: string
}

export interface Annotation {
  id: string
  pageUrl: string
  selector: SelectorRecord | null
  comment: string
  category: Category
  status: Status
  author: string
  createdAt: string
  /** Last local mutation time — drives the hydrate merge (newer side wins). */
  updatedAt?: string
  styling: AnnotationStyling
  suggestedChanges: Record<string, string>
  replies: Reply[]
}

export interface Counts {
  total: number
  open: number
  resolved: number
}
