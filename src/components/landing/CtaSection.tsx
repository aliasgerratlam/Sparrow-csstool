import { extensionStoreUrl } from '@/lib/extension-download'
import { LpContainer, Pin } from './lp'

/* Closing call to action — the solid-blue card with floating decorations.
   Both buttons link straight to their store listing (same URLs the install
   CTAs use), so each works as a real link, including in a new tab. */
export function CtaSection() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="mt-20 lg:mt-40"
    >
      <LpContainer>
        <div className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-lp-blue px-6 py-14 text-center shadow-[0_30px_60px_-24px_rgba(37,99,235,0.7)] lg:px-16 lg:py-[88px] lg:shadow-[0_40px_80px_-30px_rgba(37,99,235,0.7)]">
          <div className="absolute -bottom-[110px] -left-20 size-[260px] rounded-full bg-white/[0.12] lg:-bottom-[120px] lg:size-[360px]" />
          <div className="absolute -top-20 -right-[60px] size-[200px] rounded-full bg-[rgba(147,197,253,0.35)] lg:-top-[100px] lg:size-[300px] lg:blur-[10px]" />
          <div className="lp-glass lp-bob absolute top-16 left-24 hidden rounded-xl border border-white/35 bg-white/[0.18] px-3 py-2 text-white [--r:-10deg] lg:block">
            <span className="lp-mono text-[13px]">padding: 24px;</span>
          </div>
          <Pin
            n={4}
            className="lp-bob2 absolute top-[22px] right-[22px] size-8 bg-white text-[13px] text-lp-blue [--r:8deg] lg:top-auto lg:right-[110px] lg:bottom-[70px] lg:size-10 lg:text-base lg:rounded-[9999px_9999px_9999px_6px]"
          />
          <h2
            id="cta-heading"
            className="relative max-w-[760px] text-[34px] leading-10 font-semibold tracking-[-0.03em] text-white lg:text-[56px] lg:leading-16 lg:tracking-[-0.035em]"
          >
            Stop guessing what&rsquo;s on the page. Start knowing.
          </h2>
          <p className="relative mt-4 text-base leading-6 text-[#dbeafe] lg:mt-5 lg:text-lg lg:leading-7">
            Add Sparrow to your browser — it&rsquo;s free.
          </p>
          <div className="relative mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:gap-3 lg:mt-9">
            <a
              href={extensionStoreUrl('chromium')}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn flex h-[52px] items-center justify-center rounded-full bg-white px-[26px] text-base font-medium text-lp-blue-700 shadow-[0_12px_28px_-8px_rgba(9,9,11,0.35)] hover:bg-[#eff6ff]"
            >
              Add to Chrome
            </a>
            <a
              href={extensionStoreUrl('firefox')}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-glass flex h-[52px] items-center justify-center rounded-full border border-white/45 bg-white/[0.16] px-[26px] text-base font-medium text-white hover:bg-white/25"
            >
              Add to Firefox
            </a>
          </div>
        </div>
      </LpContainer>
    </section>
  )
}
