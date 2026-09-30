import { Fragment } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useExtensionDownload } from '@/hooks/use-extension-download'
import { CompactWindow, DesktopWindow } from './HeroWindow'
import { Icon, LpContainer, ScaledStage, Sparkle, useToolCycle } from './lp'

const PRODUCT_HUNT_URL =
  'https://www.producthunt.com/products/sparrow-css-inspector-annotator'

const WORKS_ON = [
  { label: 'Production' },
  { label: 'Staging' },
  { label: 'localhost:3000', mono: true },
  { label: 'Chrome', divider: true },
  { label: 'Firefox' },
] as const

/* Hero — headline, CTAs and the animated product window. The two windows share
   one tool state so the demo steps through Inspect → Annotate → … until the
   visitor clicks a tool. The live-demo button drives the real scanner (it
   inspects this very page), so it only shows where hover exists (lg+). */
export function Hero() {
  const { isActive, toggle } = useScanner()
  const { getExtension } = useExtensionDownload()
  const { tool, pick } = useToolCycle()

  return (
    <>
      <section
        id="home"
        aria-labelledby="hero-heading"
        className="pt-[116px] lg:pt-[176px]"
      >
        <LpContainer className="flex flex-col items-center text-center">
          <a
            href={PRODUCT_HUNT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-glass lp-rise lp-d1 inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/65 py-[5px] pr-3 pl-[5px] text-xs font-medium text-lp-text shadow-[0_4px_16px_-8px_rgba(37,99,235,0.3)] lg:gap-2.5 lg:py-1.5 lg:pr-3.5 lg:pl-1.5 lg:text-[13px]"
          >
            <span className="rounded-full bg-lp-blue px-[9px] py-[3px] text-[11px] text-white lg:px-2.5 lg:text-xs">
              New
            </span>
            Featured on Product Hunt
            <span className="hidden sm:inline"> · Chrome &amp; Firefox</span>
            <Icon name="arrow" size={14} className="hidden sm:block" />
          </a>

          <h1
            id="hero-heading"
            className="lp-rise lp-d2 mt-[22px] text-[44px] leading-[48px] font-semibold tracking-[-0.035em] text-lp-ink sm:text-[60px] sm:leading-[64px] lg:mt-7 lg:max-w-[980px] lg:text-[76px] lg:leading-[80px]"
          >
            Understand any website{' '}
            <span className="relative whitespace-nowrap text-lp-blue">
              in one hover.
              <Sparkle
                fill="#fcd34d"
                className="lp-twinkle absolute -top-3.5 -right-[22px] size-5 lg:-top-1 lg:-right-11 lg:size-[30px]"
              />
              <Sparkle
                fill="#60a5fa"
                className="lp-twinkle absolute top-5 -right-[30px] size-3 lg:top-[34px] lg:-right-[62px] lg:size-4"
                style={{ animationDelay: '-1.2s' }}
              />
              <svg
                className="lp-draw absolute -bottom-1.5 left-0 h-2.5 w-full lg:-bottom-2.5 lg:h-3.5"
                viewBox="0 0 300 14"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M3 10 C 60 2, 120 2, 160 7 S 260 12, 297 4"
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="lp-rise lp-d3 mt-[22px] max-w-[680px] text-base leading-[26px] text-lp-body lg:mt-7 lg:text-xl lg:leading-[30px]">
            Inspect CSS, annotate pages, collaborate live, and pull colors, fonts
            and assets —{' '}
            <span className="lg:hidden">from</span>
            <span className="hidden lg:inline">all from</span> one lightweight
            browser extension
            <span className="hidden lg:inline">
              {' '}
              for developers, designers and agencies
            </span>
            .
          </p>

          <div className="lp-rise lp-d4 mt-7 flex w-full max-w-md flex-col gap-2.5 lg:mt-9 lg:w-auto lg:max-w-none lg:flex-row lg:gap-3">
            {/* Opens the extension's store listing for the visitor's browser. */}
            <button
              type="button"
              onClick={() => getExtension()}
              className="lp-btn flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-lp-blue px-[26px] text-base font-medium text-white shadow-[0_12px_28px_-8px_rgba(37,99,235,0.6)] hover:bg-lp-blue-700"
            >
              <Icon name="download" size={18} />
              Get the Sparrow extension
            </button>
            <button
              type="button"
              onClick={toggle}
              className="scanner-demo-toggle lp-btn lp-glass hidden h-[52px] items-center justify-center gap-2.5 rounded-full border border-white/90 bg-white/65 px-6 text-base font-medium text-lp-ink shadow-[0_8px_24px_-12px_rgba(9,9,11,0.2)] hover:bg-white/90 lg:flex"
            >
              <Icon name="play" size={18} />
              {isActive ? 'Stop demo' : 'Try the live demo'}
            </button>
          </div>
          <p className="lp-rise lp-d4 mt-3.5 text-[13px] text-lp-muted lg:mt-4">
            Free forever plan ·{' '}
            <span className="lg:hidden">Chrome &amp; Firefox</span>
            <span className="hidden lg:inline">No account needed to inspect</span>
          </p>

          <div className="lp-rise lp-d5 mt-11 w-full lg:mt-16">
            <div className="lg:hidden">
              <CompactWindow tool={tool} onPick={pick} />
            </div>
            <ScaledStage width={1200} height={660} className="hidden lg:block">
              <DesktopWindow tool={tool} onPick={pick} />
            </ScaledStage>
          </div>
        </LpContainer>
      </section>

      <section
        aria-label="Where Sparrow works"
        className="mt-10 lg:mt-[72px]"
      >
        <LpContainer className="flex flex-col items-center gap-3 lg:flex-row lg:flex-wrap lg:justify-center">
          <span className="text-[13px] text-lp-muted lg:mr-2 lg:text-sm">
            Works on any page your browser opens
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2 lg:gap-3">
            {WORKS_ON.map((chip) => (
              <Fragment key={chip.label}>
                {'divider' in chip && (
                  <span
                    aria-hidden="true"
                    className="mx-2 hidden h-6 w-px bg-[#e4e4e7] lg:block"
                  />
                )}
                <span
                  className={
                    'lp-glass rounded-full border border-white/90 bg-white/65 px-3.5 py-[7px] text-lp-text lg:px-4 lg:py-2 ' +
                    ('mono' in chip
                      ? 'lp-mono text-xs lg:text-[13px]'
                      : 'text-[13px] font-medium')
                  }
                >
                  {chip.label}
                </span>
              </Fragment>
            ))}
          </div>
        </LpContainer>
      </section>
    </>
  )
}
