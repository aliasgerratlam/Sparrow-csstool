import { AlignLeft, Share2, User, X } from 'lucide-react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotationCounts } from '@/hooks/use-annotations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ScannerToolbar() {
  const { frozen, mode, disable } = useScanner()
  const ui = useAnnotationUI()
  const counts = useAnnotationCounts()

  return (
    <div id="scanner-toolbar">
      <span id="scanner-badge">
        <span className="scanner-badge-dot" />
        CSS Scanner Active
      </span>

      <div id="scanner-hint">
        {frozen ? (
          <span className="scanner-hint-frozen">
            📌 Frozen · Click again or Esc to resume
          </span>
        ) : (
          <>
            <kbd className="scanner-key">Hover</kbd>
            <span className="scanner-hint-label">inspect</span>
            <span className="scanner-hint-sep">·</span>
            <kbd className="scanner-key">Click</kbd>
            <span className="scanner-hint-label">freeze</span>
            <span className="scanner-hint-sep">·</span>
            <kbd className="scanner-key">Esc</kbd>
            <span className="scanner-hint-label">exit</span>
          </>
        )}
      </div>

      <div id="scanner-toolbar-right">
        <div className="annot-author-field">
          <User className="annot-author-icon" size={15} strokeWidth={2} />
          <Input
            className="annot-author-input"
            type="text"
            placeholder="Your name (e.g. Alex)"
            autoComplete="off"
            value={ui.author}
            onChange={(e) => ui.setAuthor(e.target.value)}
          />
        </div>
        {mode === 'annotate' && (
          <>
            <Button
              id="scanner-review-btn"
              variant="ghost"
              title="Open review sidebar"
              onClick={ui.toggleSidebar}
            >
              <AlignLeft size={15} strokeWidth={2.25} />
              Review
              <span className="scanner-review-count">{counts.total}</span>
            </Button>
            <Button
              id="scanner-share-btn"
              variant="ghost"
              title="Share annotations"
              onClick={() => ui.setShareOpen(true)}
            >
              <Share2 size={14} strokeWidth={2.25} />
              Share
            </Button>
          </>
        )}
        <Button id="scanner-disable-btn" variant="ghost" onClick={disable}>
          <X size={15} strokeWidth={2.5} />
          Disable Scanner
        </Button>
      </div>
    </div>
  )
}
