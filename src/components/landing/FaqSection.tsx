import { useState } from 'react'
import { cn } from '@/lib/format'
import { Icon, LpContainer, SectionBadge, STACK } from './lp'

const CONTACT_EMAIL = 'hello@trysparrowcss.com'

const FAQS = [
  {
    q: 'What exactly is Sparrow?',
    a: 'A browser extension that overlays a design toolkit on any webpage — inspect CSS, measure spacing, pull colors, fonts and assets, and pin feedback without DevTools or screenshots.',
  },
  {
    q: 'Do I need a technical background?',
    a: 'No. Designers and clients hover to see fonts, colors and sizes in plain language; developers get the full CSS cascade and Tailwind detection.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes, and it doesn’t expire: CSS inspector, ruler, color overview, 3 annotations per site per day and 24-hour share links.',
  },
  {
    q: 'How much does a paid plan cost?',
    a: 'Pro is $9/month ($90/year) with 10 daily annotations and 30-day links. Max is $19/month ($190/year) with unlimited annotations and permanent links.',
  },
  {
    q: 'Can I upgrade, downgrade or cancel anytime?',
    a: 'Yes, from your account portal. Paid features stay active through the billing period.',
  },
  {
    q: 'What if I hit my annotation limit?',
    a: 'Limits reset daily. Hitting the cap only pauses new pins on that site — existing annotations stay saved and editable.',
  },
  {
    q: 'Will Sparrow change the websites I use it on?',
    a: 'Never. Everything Sparrow does is a local preview only you see. The real website is untouched.',
  },
  {
    q: 'How does sharing feedback work?',
    a: 'Pin comments, click Share and send the link. Recipients see annotations in context and collaborate live; link lifetime depends on your plan.',
  },
  {
    q: 'Can clients mess up my annotations?',
    a: 'No. Client Mode lets reviewers reply and change status, but not edit or delete your notes.',
  },
  {
    q: 'Which sites does it work on?',
    a: 'Any page your browser can open: production sites, staging environments and localhost.',
  },
  {
    q: 'Does it understand Tailwind CSS?',
    a: 'Yes. Tailwind utilities are shown separately and copy in one click.',
  },
  {
    q: 'Is uploading my brand font safe?',
    a: 'Yes. Uploaded fonts are registered in your browser and never sent to a server.',
  },
]

function ContactLine({ className }: { className?: string }) {
  return (
    <p className={className}>
      Still curious? Write to{' '}
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="text-lp-blue hover:text-lp-blue-700"
      >
        {CONTACT_EMAIL}
      </a>{' '}
      <span className="hidden lg:inline">and a human replies.</span>
    </p>
  )
}

export function FaqSection() {
  const [open, setOpen] = useState(0)

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mt-24 lg:mt-40"
    >
      <LpContainer>
        <div
          className={cn(
            STACK,
            'flex flex-col lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-16',
          )}
        >
          <div className="flex flex-col items-center lg:items-start">
            <SectionBadge>FAQ</SectionBadge>
            <h2
              id="faq-heading"
              className="mt-3.5 text-center text-[32px] leading-[38px] font-semibold tracking-[-0.03em] text-lp-ink md:text-[40px] md:leading-[48px] lg:mt-4 lg:text-left lg:text-5xl lg:leading-[56px]"
            >
              Questions, answered
            </h2>
            <ContactLine className="mt-4 hidden text-base leading-6 text-lp-body lg:block" />
          </div>

          <div className="mt-7 flex flex-col gap-2 lg:mt-0 lg:gap-2.5">
            {FAQS.map((item, i) => {
              const isOpen = open === i
              return (
                <div
                  key={item.q}
                  className={cn(
                    'lp-glass rounded-xl border border-white/90 shadow-[0_6px_20px_-12px_rgba(30,64,175,0.3)] transition-colors duration-150',
                    isOpen ? 'bg-white/80' : 'bg-white/55',
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="lp-btn flex min-h-14 w-full items-center justify-between gap-3 border-0 bg-transparent py-3 pr-3.5 pl-4 text-left text-[15px] leading-[21px] font-medium text-lp-ink lg:gap-4 lg:px-5 lg:text-base"
                  >
                    <span>{item.q}</span>
                    <span
                      className={cn(
                        'flex size-[26px] shrink-0 items-center justify-center rounded-full transition-[rotate,background-color] duration-200 lg:size-7',
                        isOpen
                          ? 'rotate-45 bg-lp-blue text-white'
                          : 'bg-lp-blue/10 text-lp-blue-700',
                      )}
                    >
                      <Icon name="plus" size={14} strokeWidth={2.5} />
                    </span>
                  </button>
                  <div
                    id={`faq-panel-${i}`}
                    className={cn(
                      'grid transition-[grid-template-rows] duration-200',
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-4 pb-4 text-sm leading-[22px] text-lp-body lg:pr-16 lg:pl-5 lg:pb-5 lg:text-[15px] lg:leading-6">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <ContactLine className="mt-5 text-center text-sm leading-[22px] text-lp-body lg:hidden" />
        </div>
      </LpContainer>
    </section>
  )
}
