import type { ReactNode } from 'react'
import { cn } from '@/lib/format'
import { Icon, Pin, TOOLS, type IconName, type ToolId } from './lp'

/* The animated product mock under the hero headline — two compositions of the
   same scene: a pixel-positioned 1200×660 window for desktop (scaled to fit by
   <ScaledStage>) and a compact, fluid window for phones/tablets. Both share the
   tool rail + panel state owned by <Hero>. */

type WindowProps = { tool: ToolId; onPick: (id: ToolId) => void }

const RAIL_ICON: Record<ToolId, IconName> = {
  inspect: 'inspect',
  annotate: 'annotate',
  ruler: 'ruler',
  colors: 'colors',
  fonts: 'fonts',
  assets: 'assets',
}

function ToolButtons({
  tool,
  onPick,
  className,
  iconSize = 20,
}: WindowProps & { className?: string; iconSize?: number }) {
  return (
    <div role="tablist" aria-label="Sparrow tools" className={className}>
      {TOOLS.map((t) => {
        const active = tool === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={t.name}
            onClick={() => onPick(t.id)}
            className={cn(
              'lp-btn flex size-11 items-center justify-center rounded-[10px] border-0',
              active ? 'bg-lp-blue text-white' : 'bg-transparent text-lp-body',
            )}
          >
            <Icon name={RAIL_ICON[t.id]} size={iconSize} />
          </button>
        )
      })}
    </div>
  )
}

function ToolInfo({ tool, compact }: { tool: ToolId; compact?: boolean }) {
  const t = TOOLS.find((x) => x.id === tool) ?? TOOLS[0]
  return (
    <div>
      <div
        className={cn(
          'font-medium tracking-[0.06em] text-lp-blue uppercase',
          compact ? 'text-[11px]' : 'text-xs',
        )}
      >
        {t.name}
      </div>
      <div
        className={cn(
          'text-[13px] leading-[18px] text-lp-body',
          compact ? 'mt-0.5' : 'mt-1',
        )}
      >
        {t.hint}
      </div>
    </div>
  )
}

function Dots({ size }: { size: number }) {
  return (
    <div className="flex gap-1.5 lg:gap-2">
      {['bg-[#fca5a5]', 'bg-[#fcd34d]', 'bg-[#86efac]'].map((c) => (
        <span
          key={c}
          className={cn('rounded-full', c)}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  )
}

function FloatChip({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'lp-glass absolute z-[3] flex items-center gap-2.5 rounded-xl border border-white/90 bg-white/70 px-3.5 py-2.5 shadow-[0_16px_36px_-12px_rgba(37,99,235,0.35)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ───────────────────────── desktop (1200 × 660) ───────────────────────── */

export function DesktopWindow({ tool, onPick }: WindowProps) {
  return (
    <div className="relative h-[660px] w-[1200px] text-left">
      {/* floating playful chips */}
      <FloatChip className="lp-bob top-[90px] left-[-36px] [--r:-6deg]">
        <span className="size-[22px] rounded-md bg-lp-blue" />
        <span className="lp-mono text-[13px] text-lp-ink">#2563eb</span>
        <span className="text-xs text-lp-muted">34% of page</span>
      </FloatChip>
      <FloatChip className="lp-bob2 top-10 right-[-40px] [--r:5deg]">
        <span className="font-serif text-xl font-semibold">Aa</span>
        <span className="text-[13px] text-lp-text">
          Inter <span className="text-lp-blue">→</span> Manrope
        </span>
      </FloatChip>
      <FloatChip className="lp-bob3 bottom-[60px] left-[-24px] [--r:4deg]">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#16a34a] text-white">
          <Icon name="check" size={14} strokeWidth={2.5} />
        </span>
        <span className="text-[13px] text-lp-text">Pin #3 resolved by client</span>
      </FloatChip>

      <div className="lp-glass absolute inset-0 flex flex-col overflow-hidden rounded-[20px] border border-white/85 bg-white/45 shadow-[0_40px_80px_-30px_rgba(30,64,175,0.45)]">
        {/* window bar */}
        <div className="flex h-12 items-center gap-4 border-b border-white/70 bg-white/40 px-[18px]">
          <Dots size={12} />
          <div className="flex grow justify-center">
            <div className="lp-mono flex h-7 w-[420px] items-center justify-center rounded-full bg-white/75 text-xs text-lp-muted">
              staging.acme-store.dev/pricing
            </div>
          </div>
          <div className="w-[60px]" />
        </div>

        <div className="relative flex grow">
          {/* fake page */}
          <div className="relative flex grow flex-col gap-[22px] px-12 py-10">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-[110px] rounded-md bg-[rgba(9,9,11,0.14)]" />
              <div className="flex gap-3.5">
                <div className="h-2.5 w-14 rounded-md bg-[rgba(9,9,11,0.1)]" />
                <div className="h-2.5 w-14 rounded-md bg-[rgba(9,9,11,0.1)]" />
                <div className="h-2.5 w-14 rounded-md bg-[rgba(9,9,11,0.1)]" />
              </div>
            </div>
            <div className="mt-[18px] h-[26px] w-[420px] rounded-lg bg-[rgba(9,9,11,0.16)]" />
            <div className="h-3 w-[320px] rounded-md bg-[rgba(9,9,11,0.09)]" />
            <div className="mt-2.5 flex gap-5">
              <div className="h-[250px] w-[200px] rounded-xl border border-[rgba(9,9,11,0.06)] bg-white/70" />
              {/* selected element */}
              <div className="relative h-[250px] w-[200px] rounded-xl bg-lp-blue/[0.08] outline-2 outline-lp-blue">
                <div className="lp-mono lp-labelpop absolute top-[-30px] left-[-2px] rounded-md bg-lp-blue px-2 py-1 text-[11px] whitespace-nowrap text-white">
                  div.plan-card · 200 × 250
                </div>
                <svg
                  className="lp-ants absolute top-6 left-6"
                  width="152"
                  height="202"
                  viewBox="0 0 152 202"
                  aria-hidden="true"
                >
                  <rect
                    x="0.75"
                    y="0.75"
                    width="150.5"
                    height="200.5"
                    rx="6"
                    fill="none"
                    stroke="#2563eb"
                    strokeOpacity="0.6"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                  />
                </svg>
                <div className="lp-mono absolute top-1 left-[78px] text-[10px] text-lp-blue-700">
                  24
                </div>
              </div>
              <div className="relative h-[250px] w-[200px] rounded-xl border border-[rgba(9,9,11,0.06)] bg-white/70">
                {/* annotation pin */}
                <div className="lp-ping absolute top-9 right-[-14px] size-[30px] rounded-full bg-lp-blue" />
                <Pin
                  n={1}
                  className="absolute top-9 right-[-14px] size-[30px] bg-lp-blue text-[13px] text-white shadow-[0_6px_16px_-4px_rgba(37,99,235,0.7)]"
                />
              </div>
            </div>

            {/* ruler between the first two cards */}
            <div className="absolute top-[316px] left-[248px] h-2.5 w-5">
              <div className="lp-measure absolute top-1 left-0 h-0.5 w-5 bg-[#f43f5e]" />
              <div className="absolute top-0 left-0 h-2.5 w-0.5 bg-[#f43f5e]" />
              <div className="absolute top-0 right-0 h-2.5 w-0.5 bg-[#f43f5e]" />
            </div>
            <div className="lp-mono lp-labelpop absolute top-[290px] left-[238px] rounded-md bg-[#f43f5e] px-1.5 py-0.5 text-[10px] text-white">
              20px
            </div>

            {/* client comment */}
            <div className="lp-glass lp-bob2 absolute top-[262px] left-[452px] z-[4] w-[230px] rounded-xl border border-white/95 bg-white/85 p-3.5 shadow-[0_16px_40px_-12px_rgba(9,9,11,0.25)]">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-[#bfdbfe] text-[11px] font-semibold text-[#1e40af]">
                  JM
                </span>
                <span className="text-[13px] font-medium">Client · just now</span>
              </div>
              <p className="mt-2 text-[13px] leading-[18px] text-lp-text">
                Can this card match the others? The padding feels off.
              </p>
            </div>

            {/* animated cursor */}
            <div
              aria-hidden="true"
              className="lp-cursor pointer-events-none absolute top-0 left-0 z-[5] flex items-start gap-0.5"
            >
              <svg width="26" height="26" viewBox="0 0 24 24">
                <path
                  d="M4 3l7.5 18 2.6-7.4L21.5 11z"
                  fill="#09090b"
                  stroke="#ffffff"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="mt-5 rounded-[9999px_9999px_9999px_4px] bg-[#f43f5e] px-[9px] py-[3px] text-xs font-medium text-white">
                you
              </span>
            </div>
          </div>

          {/* Sparrow panel */}
          <div className="lp-glass m-4 flex w-[380px] overflow-hidden rounded-2xl border border-white/95 bg-white/[0.72] shadow-[0_20px_50px_-20px_rgba(30,64,175,0.4)]">
            <ToolButtons
              tool={tool}
              onPick={onPick}
              className="flex w-[60px] flex-col gap-1.5 border-r border-[rgba(9,9,11,0.06)] bg-white/50 px-2 py-3"
            />
            <div className="flex grow flex-col gap-3.5 p-[18px]">
              <ToolInfo tool={tool} />
              <CssSnippet />
              <div className="flex flex-wrap gap-1.5">
                {['p-6', 'rounded-xl', 'bg-blue-50'].map((c) => (
                  <span
                    key={c}
                    className="lp-mono rounded-md bg-lp-blue/10 px-2 py-1 text-[11px] text-lp-blue-700"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  className="lp-btn h-9 grow rounded-lg border-0 bg-lp-blue text-[13px] font-medium text-white hover:bg-lp-blue-700"
                >
                  Copy CSS
                </button>
                <button
                  type="button"
                  className="lp-btn h-9 grow rounded-lg border-0 bg-[#f4f4f5] text-[13px] font-medium text-[#18181b] hover:bg-[#e4e4e7]"
                >
                  Copy Tailwind
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* The dark CSS readout shared by both windows (winning rule on top, the
   overridden declaration struck through, a blinking caret). */
function CssSnippet({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'lp-mono rounded-xl bg-[rgba(9,9,11,0.88)] text-xs text-[#e4e4e7]',
        compact ? 'mt-2 rounded-[10px] p-3 leading-[19px]' : 'p-3.5 leading-5',
      )}
    >
      <div>
        <span className="text-[#93c5fd]">.plan-card</span> {'{'}
      </div>
      <div className="pl-3.5">
        padding: <span className="text-[#fcd34d]">24px</span>;
      </div>
      <div className="pl-3.5">
        border-radius: <span className="text-[#fcd34d]">12px</span>;
      </div>
      {!compact && (
        <div className="pl-3.5">
          background:{' '}
          <span className="inline-block size-[9px] rounded-[2px] bg-[#eff6ff] align-middle" />{' '}
          <span className="text-[#fcd34d]">#eff6ff</span>;
        </div>
      )}
      <div className="pl-3.5 text-[#71717a] line-through">padding: 16px;</div>
      <div>
        {'}'}
        <span className="lp-caret ml-1 inline-block h-3.5 w-[7px] bg-[#93c5fd] align-[-2px]" />
      </div>
    </div>
  )
}

/* ───────────────────── compact (phones & tablets) ───────────────────── */

export function CompactWindow({ tool, onPick }: WindowProps) {
  return (
    <div className="relative mx-auto w-full max-w-[560px] text-left">
      <FloatChip className="lp-bob -top-[18px] -right-2 z-[3] gap-2 rounded-[10px] bg-white/80 px-2.5 py-2 [--r:6deg]">
        <span className="size-4 rounded bg-lp-blue" />
        <span className="lp-mono text-[11px]">#2563eb</span>
      </FloatChip>

      <div className="lp-glass overflow-hidden rounded-[18px] border border-white/90 bg-white/50 shadow-[0_30px_60px_-24px_rgba(30,64,175,0.45)]">
        <div className="flex h-[38px] items-center gap-2.5 border-b border-white/70 bg-white/40 px-3">
          <Dots size={9} />
          <div className="lp-mono flex h-[22px] grow items-center justify-center rounded-full bg-white/75 text-[10px] text-lp-muted">
            acme-store.dev/pricing
          </div>
        </div>

        <div className="relative flex gap-3 px-[18px] pt-9 pb-[18px]">
          <div className="h-[120px] flex-1 rounded-[10px] border border-[rgba(9,9,11,0.06)] bg-white/75" />
          {/* selected element */}
          <div className="relative h-[120px] flex-1 rounded-[10px] bg-lp-blue/[0.08] outline-2 outline-lp-blue">
            <div className="lp-mono lp-labelpop absolute top-[-24px] left-[-2px] rounded-md bg-lp-blue px-1.5 py-[3px] text-[10px] whitespace-nowrap text-white">
              .plan-card
            </div>
            <svg
              className="lp-ants absolute inset-3.5 size-[calc(100%-28px)] overflow-visible"
              aria-hidden="true"
            >
              <rect
                width="100%"
                height="100%"
                rx="5"
                fill="none"
                stroke="#2563eb"
                strokeOpacity="0.6"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
            </svg>
          </div>
          <div className="relative h-[120px] flex-1 rounded-[10px] border border-[rgba(9,9,11,0.06)] bg-white/75">
            <div className="lp-ping absolute top-[18px] right-[-8px] size-[26px] rounded-full bg-lp-blue" />
            <Pin
              n={1}
              className="absolute top-[18px] right-[-8px] size-[26px] bg-lp-blue text-xs text-white shadow-[0_6px_14px_-4px_rgba(37,99,235,0.7)]"
            />
          </div>

          <div
            aria-hidden="true"
            className="lp-cursor-sm pointer-events-none absolute z-[5] flex items-start gap-0.5"
          >
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path
                d="M4 3l7.5 18 2.6-7.4L21.5 11z"
                fill="#09090b"
                stroke="#ffffff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span className="mt-4 rounded-[9999px_9999px_9999px_4px] bg-[#f43f5e] px-2 py-0.5 text-[11px] font-medium text-white">
              you
            </span>
          </div>
        </div>

        <div className="lp-glass mx-3 mb-3 rounded-[14px] border border-white/95 bg-white/80 p-2 shadow-[0_16px_36px_-16px_rgba(30,64,175,0.4)]">
          <ToolButtons
            tool={tool}
            onPick={onPick}
            iconSize={19}
            className="flex justify-between"
          />
          <div className="px-1.5 pt-2.5 pb-1">
            <ToolInfo tool={tool} compact />
          </div>
          <CssSnippet compact />
        </div>
      </div>
    </div>
  )
}
