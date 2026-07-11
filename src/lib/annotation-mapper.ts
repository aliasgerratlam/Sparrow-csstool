import type {
  Annotation,
  AnnotationStyling,
  Category,
  Reply,
  SelectorRecord,
  Status,
} from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   Single source of truth for the Annotation ⇄ Supabase-row shape. The DB uses
   snake_case columns (see supabase/schema.sql); the app uses the camelCase
   `Annotation` type. Both the store's writes and the realtime subscription go
   through here so they can never drift.
───────────────────────────────────────────────────────────────────────── */

export interface AnnotationRow {
  id: string
  page_url: string
  selector: SelectorRecord | null
  comment: string
  category: string
  status: string
  author: string
  created_at: string
  updated_at: string
  styling: AnnotationStyling
  suggested_changes: Record<string, string>
  replies: Reply[]
}

export function toRow(ann: Annotation): AnnotationRow {
  return {
    id: ann.id,
    page_url: ann.pageUrl,
    selector: ann.selector,
    comment: ann.comment,
    category: ann.category,
    status: ann.status,
    author: ann.author,
    created_at: ann.createdAt || new Date().toISOString(),
    // Pass the store's mutation stamp through unchanged so our own realtime
    // echo compares equal to the local item (no-op churn check in the store).
    updated_at: ann.updatedAt || new Date().toISOString(),
    styling: ann.styling,
    suggested_changes: ann.suggestedChanges,
    replies: ann.replies,
  }
}

export function fromRow(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    pageUrl: row.page_url,
    selector: row.selector ?? null,
    comment: row.comment ?? '',
    category: (row.category ?? 'General') as Category,
    status: (row.status ?? 'Open') as Status,
    author: row.author ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? row.created_at ?? '',
    styling: row.styling,
    suggestedChanges: row.suggested_changes ?? {},
    replies: Array.isArray(row.replies) ? row.replies : [],
  }
}
