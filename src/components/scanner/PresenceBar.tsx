import { memo } from 'react'
import { useCollab } from '@/context/collab-context'
import { initials } from '@/lib/collab-identity'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/* Toolbar presence cluster — overlapping avatars of the *other* people who
   joined this room through the share link, with a "+N" overflow and a tooltip
   roster. You are never shown here (sharing/hosting doesn't put you "online");
   renders nothing when collab is off or no one else has joined. */

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
        <div className="presence-bar" aria-label={`${peers.length} online`}>
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
      <TooltipContent side="bottom" light className="max-w-[220px]">
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold text-[#6b7280]">
            {peers.length} online
          </div>
          {peers.map((u) => (
            <div key={u.id} className="flex items-center gap-2 text-[12px] text-[#1f2430]">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: u.color }}
              />
              <span className="truncate">{u.name}</span>
              <span className="ml-auto shrink-0 text-[10px] uppercase text-[#9aa1ad]">
                {u.role}
              </span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
})
