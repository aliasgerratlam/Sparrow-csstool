import { useScanner, type ScannerMode } from '@/context/scanner-context'
import { Button } from '@/components/ui/button'

export function ModeRail() {
  const { mode, frozen, setMode, unfreeze } = useScanner()

  const select = (m: ScannerMode) => {
    // Switching tools resets any frozen state — a ruler anchor and an inspect
    // selection share the same frozen/selectedEl, so carrying one into another
    // tool leaves you stuck on the previous element.
    if (m !== mode && frozen) unfreeze()
    setMode(m)
  }

  return (
    <div id="mode-rail" role="toolbar" aria-label="Scanner mode">
      <Button
        id="rail-inspect"
        variant="ghost"
        className={'mode-rail-btn' + (mode === 'inspect' ? ' active' : '')}
        data-mode="inspect"
        data-tooltip="Inspect"
        aria-label="Inspect"
        onClick={() => select('inspect')}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8.47 4.97a.75.75 0 0 0 0 1.06L9.94 7.5 8.47 8.97a.75.75 0 1 0 1.06 1.06l2-2a.75.75 0 0 0 0-1.06l-2-2a.75.75 0 0 0-1.06 0ZM6.53 6.03a.75.75 0 0 0-1.06-1.06l-2 2a.75.75 0 0 0 0 1.06l2 2a.75.75 0 1 0 1.06-1.06L5.06 7.5l1.47-1.47Z" />
          <path d="M12.246 13.307a7.501 7.501 0 1 1 1.06-1.06l2.474 2.473a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM1.5 7.5a6.002 6.002 0 0 0 3.608 5.504 6.002 6.002 0 0 0 6.486-1.117.748.748 0 0 1 .292-.293A6 6 0 1 0 1.5 7.5Z" />
        </svg>
      </Button>
      <Button
        id="rail-annotate"
        variant="ghost"
        className={'mode-rail-btn' + (mode === 'annotate' ? ' active' : '')}
        data-mode="annotate"
        data-tooltip="Annotate"
        aria-label="Annotate"
        onClick={() => select('annotate')}
      >
        <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
          <path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.7 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1 0 32c0 8.8 7.2 16 16 16l32 0zM362.7 18.7L348.3 33.2 325.7 55.8 314.3 67.1l33.9 33.9 62.1 62.1 33.9 33.9 11.3-11.3 22.6-22.6 14.5-14.5c25-25 25-65.5 0-90.5L453.3 18.7c-25-25-65.5-25-90.5 0zm-47.4 168l-144 144c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l144-144c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6z" />
        </svg>
      </Button>
      <Button
        id="rail-ruler"
        variant="ghost"
        className={'mode-rail-btn' + (mode === 'ruler' ? ' active' : '')}
        data-mode="ruler"
        data-tooltip="Ruler"
        aria-label="Ruler"
        onClick={() => select('ruler')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15.5 2.5 21.5 8.5a1.5 1.5 0 0 1 0 2.1L10.6 21.5a1.5 1.5 0 0 1-2.1 0L2.5 15.5a1.5 1.5 0 0 1 0-2.1L13.4 2.5a1.5 1.5 0 0 1 2.1 0Z" />
          <path d="M7 9.5 9 11.5M10 6.5 13 9.5M13.5 4 15.5 6M4.5 12 6.5 14" />
        </svg>
      </Button>
      <Button
        id="rail-dropper"
        variant="ghost"
        className={'mode-rail-btn' + (mode === 'dropper' ? ' active' : '')}
        data-mode="dropper"
        data-tooltip="Color Dropper"
        aria-label="Color Dropper"
        onClick={() => select('dropper')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 8 8.4-3.6a2 2 0 0 0-2.8-2.8L14 10" />
          <path d="M12 8 4.5 15.5a2.5 2.5 0 0 0 0 3.5l.5.5a2.5 2.5 0 0 0 3.5 0L16 12" />
          <path d="m18.5 2.5 3 3" />
          <path d="m12 8 4 4" />
        </svg>
      </Button>
    </div>
  )
}
