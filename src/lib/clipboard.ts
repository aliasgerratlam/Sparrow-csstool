/** Copy text to the clipboard, falling back to a hidden textarea + execCommand.
    Resolves true only when a copy actually succeeded, so callers can show an
    honest "copied" / "copy failed" state. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* fall through to legacy path */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    /* ignore */
  }
  ta.remove()
  return ok
}
