import { useEffect, useRef, useState } from 'react'
import { LogOut, User as UserIcon } from 'lucide-react'
import { useAuth, userDisplayName } from '@/context/auth-context'
import { useAppNavigate } from '@/context/navigation-context'
import { initials } from '@/lib/collab-identity'

/* Signed-in toolbar chip: an avatar bubble that opens a small popover with the
   account email and a Logout action. Lightweight (local state + click-outside);
   the repo has no dropdown primitive. It sits inside #scanner-toolbar, which is
   already whitelisted in ScannerController's isScannerUI, so clicks are safe. */
export function UserMenu() {
  const { user, signOut } = useAuth()
  const appNavigate = useAppNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const name = userDisplayName(user)
  const email = user?.email ?? ''

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      // In the extension the menu lives in a Shadow DOM, so a document-level
      // event's `target` retargets to the shadow host — `contains(e.target)`
      // would then read every in-menu click as "outside" and close the popover
      // on mousedown, before the Account/Logout click can land. composedPath()
      // crosses the shadow boundary and lists the real clicked node.
      const root = rootRef.current
      if (root && !e.composedPath().includes(root)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="auth-user-menu" ref={rootRef}>
      <button
        type="button"
        className="auth-user-chip"
        title={email || name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="auth-user-avatar">{initials(name)}</span>
      </button>
      {open && (
        <div className="auth-user-pop" role="menu">
          <div className="auth-user-info">
            <span className="auth-user-name">{name}</span>
            {email && email !== name && (
              <span className="auth-user-email">{email}</span>
            )}
          </div>
          <a
            className="auth-user-logout"
            role="menuitem"
            href="/account"
            onClick={(e) => {
              // Client-side on the web (no reload); the extension has no router,
              // so useAppNavigate falls back to a full navigation there.
              if (
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
              )
                return
              e.preventDefault()
              setOpen(false)
              appNavigate('/account')
            }}
          >
            <UserIcon size={14} strokeWidth={2} />
            Account
          </a>
          <button
            type="button"
            className="auth-user-logout"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
          >
            <LogOut size={14} strokeWidth={2} />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
