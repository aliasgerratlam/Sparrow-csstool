import { memo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCollab } from '@/context/collab-context'

/* Shown when a share link is opened on a different origin than the one it was
   created on. Collaboration is already blocked in collab-context (the join
   effect returns before hydrating annotations or opening the channel); this is
   the user-facing explanation + recovery actions. Intentionally NOT dismissible
   — there is nothing to do on this site with a foreign session link. */
export const CrossDomainDialog = memo(function CrossDomainDialog() {
  const { crossDomain, originalShareUrl, createNewSession } = useCollab()
  if (!crossDomain) return null

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="border-0 bg-transparent p-0 shadow-none sm:max-w-[560px]"
      >
        <div className="annot-share-dialog annot-crossdomain-dialog">
          <div className="annot-share-head">
            <DialogTitle asChild>
              <h3>Wrong website for this session</h3>
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <p>
              This session was created for <b>{crossDomain.origin}</b> and cannot
              be opened from this website. Please open the original website, or
              create a new session for this domain.
            </p>
          </DialogDescription>
          <div className="annot-crossdomain-actions">
            {originalShareUrl && (
              <Button
                className="annot-share-copy"
                onClick={() => {
                  window.location.href = originalShareUrl
                }}
              >
                Open Original Website
              </Button>
            )}
            <Button
              variant="ghost"
              className="annot-crossdomain-secondary"
              onClick={() => createNewSession()}
            >
              Create New Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
})
