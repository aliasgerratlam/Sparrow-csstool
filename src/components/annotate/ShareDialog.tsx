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
import { copyToClipboard } from '@/lib/clipboard'

/* A plain "here's your link" popover. The session is created by the caller
   before opening, so this is purely presentational — show the URL and copy it. */
export const ShareDialog = memo(function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { enabled, shareUrl, startSession } = useCollab()
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [retrying, setRetrying] = useState(false)

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
                  real time. This link expires 3 days after it’s created — after
                  that you can generate a new one, and your annotations stay put.
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
            </>
          ) : enabled ? (
            <>
              <DialogDescription asChild>
                <p>
                  {retrying
                    ? 'Preparing your share link…'
                    : 'Couldn’t create a share link — check your connection and try again.'}
                </p>
              </DialogDescription>
              {!retrying && (
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
