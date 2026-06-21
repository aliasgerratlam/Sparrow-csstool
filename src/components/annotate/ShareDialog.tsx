import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations } from '@/hooks/use-annotations'
import { encode } from '@/lib/share-codec'
import { copyToClipboard } from '@/lib/clipboard'

const SHARE_PREFIX = '#anr1='

export function ShareDialog() {
  const ui = useAnnotationUI()
  const items = useAnnotations()
  const [copied, setCopied] = useState(false)

  const { url, warn, over } = useMemo(() => {
    const u = location.href.split('#')[0] + SHARE_PREFIX + encode(items)
    const n = u.length
    return {
      url: u,
      over: n > 8000,
      warn:
        n > 8000
          ? `⚠ Long link (${n} chars) — some apps may truncate it.`
          : `${n} characters · opens in client review mode`,
    }
  }, [items])

  const onCopy = () => {
    void copyToClipboard(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={ui.shareOpen} onOpenChange={ui.setShareOpen}>
      <DialogContent
        showCloseButton={false}
        className="border-0 bg-transparent p-0 shadow-none sm:max-w-[560px]"
      >
        <div className="annot-share-dialog">
          <div className="annot-share-head">
            <DialogTitle asChild>
              <h3>Share this review</h3>
            </DialogTitle>
            <Button
              variant="ghost"
              className="annot-share-x"
              onClick={() => ui.setShareOpen(false)}
            >
              ✕
            </Button>
          </div>
          <DialogDescription asChild>
            <p>
              Anyone with this link can open the page in{' '}
              <b>client review mode</b> — they can reply, change status and
              preview changes, but cannot edit the original annotations.
            </p>
          </DialogDescription>
          <div className="annot-share-row">
            <Input id="annot-share-url" type="text" readOnly value={url} />
            <Button variant="ghost" className="annot-share-copy" onClick={onCopy}>
              {copied ? '✓ Copied' : '⧉ Copy'}
            </Button>
          </div>
          <div className={'annot-share-warn' + (over ? ' over' : '')}>{warn}</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
