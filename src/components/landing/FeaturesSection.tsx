import type { ReactNode } from 'react'
import { cn } from '@/lib/format'
import {
  Icon,
  LpContainer,
  Pin,
  SectionBadge,
  SectionHeading,
  STACK,
  type IconName,
} from './lp'

/* Features bento — "Six tools, one rail". One column of glass cards on
   phones/tablets, the 3-column bento (wide Inspect + Assets) at lg. */

function IconTile({
  name,
  tone = 'soft',
  className,
}: {
  name: IconName
  tone?: 'solid' | 'soft' | 'glass'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl lg:size-11',
        tone === 'solid' && 'bg-lp-blue text-white',
        tone === 'soft' && 'bg-[#dbeafe] text-lp-blue-700',
        tone === 'glass' && 'bg-white/20 text-white',
        className,
      )}
    >
      <Icon name={name} size={20} className="lg:size-[22px]" />
    </div>
  )
}

/** Icon + title row on phones, stacked (icon above title) on desktop. */
function CardHead({
  icon,
  title,
  tone,
  large,
}: {
  icon: IconName
  title: string
  tone?: 'solid' | 'soft' | 'glass'
  large?: boolean
}) {
  return (
    <div className="flex items-center gap-3 lg:block">
      <IconTile name={icon} tone={tone} />
      <h3
        className={cn(
          'text-xl leading-7 font-semibold lg:mt-6',
          large && 'lg:text-2xl lg:leading-8',
        )}
      >
        {title}
      </h3>
    </div>
  )
}

function Body({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'mt-3 text-sm leading-[22px] text-lp-body lg:mt-2 lg:text-[15px] lg:leading-6',
        className,
      )}
    >
      {children}
    </p>
  )
}

const CODE_LINE = 'pl-3 lg:pl-4'

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mt-24 lg:mt-40"
    >
      <LpContainer className="flex flex-col items-center">
        <SectionBadge>Six tools, one rail</SectionBadge>
        <SectionHeading id="features-heading" className="lg:max-w-[760px]">
          Everything you need to understand any website
        </SectionHeading>

        <div
          className={cn(
            STACK,
            'mt-8 flex flex-col gap-3 lg:mt-14 lg:grid lg:grid-cols-3 lg:gap-5',
          )}
        >
          {/* Inspect — wide */}
          <div className="lp-card lp-lift flex flex-col p-6 lg:col-span-2 lg:h-[340px] lg:flex-row lg:gap-8 lg:p-8">
            <div className="flex flex-col lg:flex-1 lg:basis-0">
              <CardHead icon="inspect" title="CSS inspector" tone="solid" large />
              <Body className="lg:mt-2">
                <span className="lg:hidden">
                  Hover anything and see the CSS that shaped it — overridden rules
                  struck through, the winner on top.
                </span>
                <span className="hidden lg:inline">
                  Hover anything and see the CSS that actually shaped it —
                  DevTools-style, overridden rules struck through, the winning
                  declaration on top.
                </span>
              </Body>
              <div className="mt-auto hidden gap-2 lg:flex">
                {['Cascade view', 'Tailwind detection'].map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-lp-blue/10 px-2.5 py-1 text-xs font-medium text-lp-blue-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="lp-mono mt-4 rotate-1 rounded-xl bg-[rgba(9,9,11,0.88)] p-3.5 text-xs leading-5 text-[#e4e4e7] lg:mt-0 lg:flex-1 lg:basis-0 lg:rotate-[1.5deg] lg:p-5 lg:text-[13px] lg:leading-[22px] lg:shadow-[0_20px_40px_-16px_rgba(9,9,11,0.5)]">
              <div className="hidden text-[#71717a] lg:block">/* winning */</div>
              <div>
                <span className="text-[#93c5fd]">.btn-primary</span> {'{'}
              </div>
              <div className={CODE_LINE}>
                background: <span className="text-[#fcd34d]">#2563eb</span>;
              </div>
              <div className={CODE_LINE}>
                border-radius: <span className="text-[#fcd34d]">8px</span>;
              </div>
              <div className={cn(CODE_LINE, 'hidden lg:block')}>
                font-weight: <span className="text-[#fcd34d]">500</span>;
              </div>
              <div>{'}'}</div>
              <div className="hidden text-[#71717a] lg:mt-1.5 lg:block">
                /* overridden */
              </div>
              <div className="text-[#71717a] line-through">
                button {'{'} border-radius: 4px; {'}'}
              </div>
            </div>
          </div>

          {/* Annotate */}
          <div className="lp-card lp-lift relative flex flex-col overflow-hidden border-white/30! bg-lp-blue! p-6 text-white shadow-[0_20px_40px_-16px_rgba(37,99,235,0.6)]! lg:h-[340px] lg:p-8">
            <div className="absolute -top-10 -right-10 size-[150px] rounded-full bg-white/[0.14] lg:size-[180px]" />
            <CardHead icon="annotate" title="Annotate & share" tone="glass" large />
            <Body className="text-[#dbeafe] lg:mt-2">
              Drop a numbered pin on the exact element, write your note, share one
              link. Clients reply live.
            </Body>
            <div className="mt-4 flex items-center lg:mt-auto">
              <Pin n={1} className="size-[30px] bg-white text-[13px] text-lp-blue lg:size-[34px] lg:text-sm" />
              <Pin n={2} className="-ml-1.5 size-[30px] rotate-[8deg] bg-white text-[13px] text-lp-blue lg:size-[34px] lg:text-sm" />
              <Pin n={3} className="-ml-1.5 size-[30px] -rotate-6 bg-white text-[13px] text-lp-blue lg:size-[34px] lg:text-sm" />
              <span className="ml-3 text-[13px] text-[#dbeafe]">Client Mode on</span>
            </div>
          </div>

          {/* Ruler */}
          <div className="lp-card lp-lift flex flex-col p-6 lg:h-[300px] lg:p-8">
            <CardHead icon="ruler" title="Ruler" />
            <Body>
              Anchor one element, hover another — Sparrow draws the exact distance.
            </Body>
            <div className="mt-7 flex items-center lg:mt-auto">
              <div className="h-8 w-14 rounded-lg border-2 border-lp-blue bg-lp-blue/[0.08] lg:h-9 lg:w-16" />
              <div className="relative h-0.5 grow bg-[#f43f5e]">
                <span className="lp-mono absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-[#f43f5e] px-1.5 py-0.5 text-[11px] text-white lg:-top-[26px]">
                  48px
                </span>
              </div>
              <div className="h-8 w-14 rounded-lg border-2 border-dashed border-[#a1a1aa] lg:h-9 lg:w-16" />
            </div>
          </div>

          {/* Colors */}
          <div className="lp-card lp-lift flex flex-col p-6 lg:h-[300px] lg:p-8">
            <CardHead icon="colors" title="Colors" />
            <Body>
              <span className="lg:hidden">
                Every color a page paints, sorted by usage. Swap any one site-wide.
              </span>
              <span className="hidden lg:inline">
                Every color a page paints, sorted by how much it&rsquo;s used. Swap
                any one site-wide.
              </span>
            </Body>
            <div className="mt-4 flex h-8 overflow-hidden rounded-full lg:mt-auto lg:h-9 lg:shadow-[0_6px_16px_-8px_rgba(9,9,11,0.3)]">
              {[
                ['34', 'bg-lp-blue'],
                ['26', 'bg-lp-ink'],
                ['18', 'bg-[#93c5fd]'],
                ['12', 'bg-[#f4f4f5]'],
                ['10', 'bg-[#fcd34d]'],
              ].map(([grow, bg]) => (
                <div key={bg} className={bg} style={{ flexGrow: Number(grow) }} />
              ))}
            </div>
          </div>

          {/* Fonts */}
          <div className="lp-card lp-lift flex flex-col p-6 lg:h-[300px] lg:p-8">
            <CardHead icon="fonts" title="Fonts" />
            <Body>
              Audit every typeface, then preview a swap from ~1,900 Google Fonts or
              your own upload.
            </Body>
            <div className="mt-4 flex items-baseline gap-3 lg:mt-auto lg:gap-3.5">
              <span className="font-serif text-[32px] leading-8 text-[#a1a1aa] line-through lg:text-4xl lg:leading-9">
                Aa
              </span>
              <Icon name="arrow" size={18} className="self-center text-lp-blue lg:size-5" />
              <span className="text-[32px] leading-8 font-semibold text-lp-blue lg:text-4xl lg:leading-9">
                Aa
              </span>
            </div>
          </div>

          {/* Assets — wide */}
          <div className="lp-card lp-lift flex flex-col p-6 lg:col-span-3 lg:h-[200px] lg:flex-row lg:items-center lg:gap-10 lg:p-8">
            <div className="flex items-center gap-3 lg:contents">
              <IconTile name="assets" />
              <h3 className="text-xl leading-7 font-semibold lg:hidden">Assets</h3>
            </div>
            <div className="lg:w-[420px] lg:shrink-0">
              <h3 className="hidden text-xl leading-7 font-semibold lg:block">Assets</h3>
              <Body className="lg:mt-2">
                <span className="lg:hidden">
                  Every image, SVG and video — background images and favicons
                  included.
                </span>
                <span className="hidden lg:inline">
                  Every image, SVG and video on the page — background images and
                  favicons included. Download one or all.
                </span>
              </Body>
            </div>
            <div className="mt-[18px] flex gap-2.5 lg:mt-0 lg:grow lg:justify-end lg:gap-3">
              <div className="flex h-16 flex-1 -rotate-5 items-end rounded-[10px] bg-[#bfdbfe] lg:size-24 lg:flex-none lg:rounded-xl lg:p-2">
                <span className="lp-mono hidden text-[10px] text-[#1e40af] lg:block">
                  hero.webp
                </span>
              </div>
              <div className="flex h-16 flex-1 rotate-3 flex-col items-center justify-center gap-2 rounded-[10px] border border-[#e4e4e7] bg-white lg:size-24 lg:flex-none lg:rounded-xl">
                <Icon name="star" size={24} className="text-lp-blue lg:size-8" />
                <span className="lp-mono hidden text-[10px] text-lp-body lg:block">
                  logo.svg
                </span>
              </div>
              <div className="flex h-16 flex-1 -rotate-2 items-center justify-center rounded-[10px] bg-lp-ink text-white lg:size-24 lg:flex-none lg:rounded-xl">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="lg:size-7">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div className="flex h-16 flex-1 rotate-4 items-center justify-center rounded-[10px] border-2 border-dashed border-[#93c5fd] bg-lp-blue/[0.08] text-xs font-medium text-lp-blue-700 lg:size-24 lg:flex-none lg:rounded-xl lg:text-[13px]">
                <span className="lg:hidden">+24</span>
                <span className="hidden lg:inline">+ 24 more</span>
              </div>
            </div>
          </div>
        </div>
      </LpContainer>
    </section>
  )
}
