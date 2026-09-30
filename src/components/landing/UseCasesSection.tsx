import type { ReactNode } from 'react'
import { cn } from '@/lib/format'
import { Pin, LpContainer, SectionBadge, SectionHeading, STACK } from './lp'

type UseCase = {
  title: string
  short: string
  body: string
  /** Offset every other card down for the staggered rhythm. */
  stagger?: boolean
  mark: ReactNode
}

const USE_CASES: UseCase[] = [
  {
    title: 'Frontend developers',
    short: 'Debug styles faster. Copy CSS or Tailwind classes straight into code.',
    body: 'Debug styles faster than DevTools. Grab fonts, margins and winning rules, then copy CSS or Tailwind classes straight into your code.',
    mark: (
      <div className="lp-mono text-[22px] leading-[26px] text-lp-blue lg:text-[28px] lg:leading-8">
        &lt;/&gt;
      </div>
    ),
  },
  {
    title: 'Designers',
    short: 'Pull palettes, identify typefaces, test fonts live, collect assets.',
    body: 'Reverse-engineer interfaces. Pull palettes with usage data, identify typefaces, test your fonts live and collect assets for moodboards.',
    stagger: true,
    mark: (
      <div className="flex">
        <span className="size-5 rounded-full bg-lp-blue lg:size-[22px]" />
        <span className="-ml-1.5 size-5 rounded-full bg-[#93c5fd] lg:-ml-2 lg:size-[22px]" />
        <span className="-ml-1.5 size-5 rounded-full bg-[#fcd34d] lg:-ml-2 lg:size-[22px]" />
      </div>
    ),
  },
  {
    title: 'Agencies & freelancers',
    short: 'Turn vague client feedback into pinned, resolvable comments.',
    body: 'Turn vague client feedback into pinned, threaded, resolvable comments. One link, live collaboration, clear status.',
    mark: (
      <Pin
        n={1}
        className="size-[26px] bg-lp-blue text-xs text-white lg:size-[30px] lg:text-[13px]"
      />
    ),
  },
  {
    title: 'QA & product teams',
    short: 'Report visual bugs in context, measured against spec.',
    body: 'Report visual bugs in context, measure spacing against spec and flag misalignments devs can find without a repro guide.',
    stagger: true,
    mark: (
      <span className="lp-mono inline-block rounded-md bg-[#f43f5e] px-[7px] py-[3px] text-xs text-white lg:px-2 lg:py-1 lg:text-[13px]">
        ±2px
      </span>
    ),
  },
]

export function UseCasesSection() {
  return (
    <section aria-labelledby="use-cases-heading" className="mt-24 lg:mt-40">
      <LpContainer className="flex flex-col items-center">
        <SectionBadge>Who it&rsquo;s for</SectionBadge>
        <SectionHeading id="use-cases-heading">
          One toolkit, four jobs done
        </SectionHeading>

        <div
          className={cn(
            STACK,
            'mt-8 grid grid-cols-2 gap-3 lg:mt-14 lg:grid-cols-4 lg:gap-5',
          )}
        >
          {USE_CASES.map((u) => (
            <div
              key={u.title}
              className={cn(
                'lp-card lp-lift p-[18px] lg:p-7',
                u.stagger &&
                  '[transform:translateY(16px)] lg:[transform:translateY(24px)]',
              )}
            >
              {u.mark}
              <h3 className="mt-3.5 text-base leading-[22px] font-semibold text-lp-ink lg:mt-5 lg:text-lg lg:leading-7">
                {u.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-[19px] text-lp-body lg:mt-2 lg:text-sm lg:leading-[22px]">
                <span className="lg:hidden">{u.short}</span>
                <span className="hidden lg:inline">{u.body}</span>
              </p>
            </div>
          ))}
        </div>
      </LpContainer>
    </section>
  )
}
