import { memo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCollab } from '@/context/collab-context'
import { useEntitlements, goToPricing } from '@/context/subscription-context'
import { copyToClipboard } from '@/lib/clipboard'
import { fmtDate } from '@/lib/format'
import { shareExpiryLabel } from '@/lib/plans'

/* A plain "here's your link" popover. The session is created by the caller
   before opening (or while it's open — see `preparing`), so this is purely
   presentational: show the URL, its real expiry, and copy it. */
export const ShareDialog = memo(function ShareDialog({
  open,
  onOpenChange,
  preparing = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True while the caller's startSession() is still in flight. */
  preparing?: boolean
}) {
  const {
    enabled,
    shareUrl,
    startSession,
    regenerateSession,
    sessionExpiresAt,
    shareError,
    shareDegraded,
    isHost,
  } = useCollab()
  const { shareExpiryMs } = useEntitlements()
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [retrying, setRetrying] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const busy = preparing || retrying

  const onCopy = async () => {
    if (!shareUrl) return
    const ok = await copyToClipboard(shareUrl)
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied('idle'), 1800)
  }

  const onRetry = async () => {
    setRetrying(true)
    try {
      await startSession()
    } finally {
      setRetrying(false)
    }
  }

  const onRegenerate = async () => {
    setRegenerating(true)
    try {
      await regenerateSession()
    } finally {
      setRegenerating(false)
    }
  }

  /* Expiry copy comes from the session ROW, not from the entitlement, whenever a
     link exists. The row is what the backend actually stamped, so this stays
     honest if the plan lookup and the DB ever disagree — and it's what a joiner
     sees too. The entitlement is only the pre-mint pitch. */
  const neverExpires = !!shareUrl && sessionExpiresAt === null
  const canUpgrade = Number.isFinite(shareExpiryMs)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-0 bg-transparent p-0 shadow-none sm:max-w-[560px]"
      >
        <div className="annot-share-dialog">
          <div className="annot-share-head">
            <DialogTitle asChild>
              <h3>Share link</h3>
            </DialogTitle>
            <Button
              variant="ghost"
              className="annot-share-x"
              onClick={() => onOpenChange(false)}
            >
              ✕
            </Button>
          </div>

          {enabled && shareUrl ? (
            <>
              <DialogDescription asChild>
                <p>
                  Anyone with this link can open this review and collaborate in
                  real time.{' '}
                  {neverExpires ? (
                    <>This link never expires.</>
                  ) : sessionExpiresAt ? (
                    <>
                      It expires <b>{fmtDate(sessionExpiresAt)}</b> — after that
                      you can generate a new one, and your annotations stay put.
                    </>
                  ) : (
                    <>
                      After it expires you can generate a new one, and your
                      annotations stay put.
                    </>
                  )}
                </p>
              </DialogDescription>
              <div className="annot-share-row">
                <Input
                  id="annot-share-url"
                  type="text"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="ghost"
                  className="annot-share-copy"
                  onClick={() => void onCopy()}
                >
                  {copied === 'ok'
                    ? '✓ Copied'
                    : copied === 'fail'
                      ? '✕ Copy failed — select the link'
                      : '⧉ Copy'}
                </Button>
              </div>

              {shareDegraded && (
                <p className="annot-share-warn over">
                  This link lasts 24 hours — we couldn’t confirm your plan. Check
                  your connection and generate a new link to get your full
                  duration.
                </p>
              )}
              {!shareDegraded && canUpgrade && (
                <p className="annot-share-warn">
                  Your plan gives share links {shareExpiryLabel(shareExpiryMs)}.{' '}
                  <button
                    type="button"
                    className="annot-share-new"
                    onClick={goToPricing}
                  >
                    See plans for longer links →
                  </button>
                </p>
              )}

              <div className="annot-share-steps">
                <h4>Sharing with someone who doesn’t have Sparrow yet?</h4>
                <ol>
                  <li>
                    <b>Install the Sparrow extension</b> — it’s required to see
                    the annotations on the page.
                  </li>
                  <li>
                    <b>Open this link</b> in the browser where the extension is
                    installed.
                  </li>
                  <li>
                    <b>Click the Sparrow icon</b> to turn it on — the pins and
                    comments appear right on the page.
                  </li>
                </ol>
              </div>

              {isHost && (
                <div className="annot-share-foot">
                  <button
                    type="button"
                    className="annot-share-new"
                    disabled={regenerating}
                    onClick={() => void onRegenerate()}
                    title="Retires the current link and creates a fresh one. Your annotations stay put."
                  >
                    {regenerating ? 'Creating a new link…' : '↻ Create a new link'}
                  </button>
                </div>
              )}
            </>
          ) : enabled ? (
            <>
              <DialogDescription asChild>
                <p>
                  {busy
                    ? 'Preparing your share link…'
                    : (shareError ??
                      'Couldn’t create a share link — check your connection and try again.')}
                </p>
              </DialogDescription>
              {!busy && (
                <div className="annot-share-row">
                  <Button
                    variant="ghost"
                    className="annot-share-copy"
                    onClick={() => void onRetry()}
                  >
                    ↻ Try again
                  </Button>
                </div>
              )}
            </>
          ) : (
            <DialogDescription asChild>
              <p>
                Live collaboration isn’t configured. Add your Supabase
                credentials (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) to
                enable share links.
              </p>
            </DialogDescription>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})
