import { memo } from 'react'
import { useCollab } from '@/context/collab-context'
import { initials } from '@/lib/collab-identity'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/* Session-pill presence cluster — overlapping avatars of the *other* people who
   joined this room through the share link, with a "+N" overflow and a tooltip
   roster. You are never shown here (sharing/hosting doesn't put you "online");
   renders nothing when collab is off or no one else has joined. Styled in
   src/styles/sparrow-ui/chrome.css. */

const MAX_AVATARS = 4

export const PresenceBar = memo(function PresenceBar() {
  const { enabled, onlineUsers, identity } = useCollab()
  // Only peers who joined via the link — exclude myself entirely.
  const peers = onlineUsers.filter((u) => u.id !== identity?.id)
  if (!enabled || peers.length === 0) return null

  const shown = peers.slice(0, MAX_AVATARS)
  const overflow = peers.length - shown.length

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="presence-bar sp-presence"
          role="group"
          tabIndex={0}
          aria-label={`${peers.length} online`}
        >
          {shown.map((u) => (
            <span
              key={u.id}
              className="presence-avatar"
              style={{ background: u.color }}
              title={u.name}
            >
              {initials(u.name)}
            </span>
          ))}
          {overflow > 0 && (
            <span className="presence-avatar presence-avatar-more">+{overflow}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={12} className="sp-presence-tip">
        <div className="sp-presence-roster">
          <div className="sp-presence-head">{peers.length} online</div>
          {peers.map((u) => (
            <div key={u.id} className="sp-presence-row">
              <span className="sp-presence-dot" style={{ background: u.color }} />
              <span className="sp-presence-name">{u.name}</span>
              <span className="sp-presence-role">{u.role}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
})
