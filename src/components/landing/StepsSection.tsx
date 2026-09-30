import { cn } from '@/lib/format'
import { LpContainer, SectionBadge, SectionHeading, STACK } from './lp'

const STEPS = [
  {
    title: 'Add to browser',
    body: 'Install the extension in seconds and pin it to your toolbar.',
    short: 'Install in seconds and pin it to your toolbar.',
    badge:
      'rounded-[13px] bg-lp-blue text-white -rotate-6 shadow-[0_8px_18px_-6px_rgba(37,99,235,0.7)] lg:rounded-2xl lg:shadow-[0_10px_24px_-8px_rgba(37,99,235,0.7)]',
  },
  {
    title: 'Open any webpage',
    body: 'Production, staging or localhost — if your browser can open it, Sparrow can read it.',
    short: 'Production, staging or localhost — if your browser opens it, Sparrow reads it.',
    badge:
      'box-border rounded-[13px] border-2 border-lp-blue bg-white text-lp-blue rotate-[5deg] lg:rounded-2xl',
  },
  {
    title: 'Inspect, annotate, measure',
    body: 'Switch between six tools from one slim rail. No DevTools, no screenshots.',
    short: 'Six tools on one slim rail. No DevTools, no screenshots.',
    badge: 'rounded-full bg-[#dbeafe] text-lp-blue-700 -rotate-3',
  },
]

/* How it works — three glass cards; a dotted path links them on desktop. */
export function StepsSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mt-24 lg:mt-40"
    >
      <LpContainer className="flex flex-col items-center">
        <SectionBadge>How it works</SectionBadge>
        <SectionHeading id="how-it-works-heading">
          Up and running in three clicks
        </SectionHeading>

        <div
          className={cn(
            STACK,
            'relative mt-8 flex flex-col gap-3 lg:mt-14 lg:grid lg:grid-cols-3 lg:gap-6',
          )}
        >
          <svg
            className="absolute top-11 left-[18%] z-0 hidden h-10 w-[64%] lg:block"
            viewBox="0 0 760 40"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 20 C 120 -10, 260 50, 380 20 S 640 -10, 760 20"
              fill="none"
              stroke="#93c5fd"
              strokeWidth="2"
              strokeDasharray="6 8"
            />
          </svg>
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="lp-card lp-lift relative flex gap-4 p-[22px] lg:block lg:p-8"
            >
              <div
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center text-lg font-semibold lg:size-14 lg:text-[22px]',
                  s.badge,
                )}
              >
                {i + 1}
              </div>
              <div>
                <h3 className="text-lg leading-[26px] font-semibold text-lp-ink lg:mt-7 lg:text-xl lg:leading-7">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm leading-[22px] text-lp-body lg:mt-2 lg:text-[15px] lg:leading-6">
                  <span className="lg:hidden">{s.short}</span>
                  <span className="hidden lg:inline">{s.body}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </LpContainer>
    </section>
  )
}
