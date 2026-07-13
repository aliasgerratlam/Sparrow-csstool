import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import { Container } from './parts'
import { cn } from '@/lib/format'

const FAQS = [
  {
    q: 'What exactly is Sparrow?',
    a: 'Sparrow is a browser extension that overlays a design toolkit on any webpage. You can inspect the CSS behind any element, measure spacing, extract colors, fonts, and assets, and pin feedback directly on the live page all without opening DevTools or taking a single screenshot.',
  },
  {
    q: 'Do I need a technical background to use it?',
    a: 'No. Designers and clients use Sparrow without writing any code hovering shows you fonts, colors, and sizes in plain terms, and leaving feedback is just click and type. Developers get the deeper layers too: the full CSS cascade, Tailwind class detection, and copy-ready code.',
  },
  {
    q: 'Is there a free plan?',
    a: "Yes, and it doesn't expire. Free includes the full CSS inspector, the ruler, the website color overview, and 3 annotations per site per day. Paid plans add site-wide color and font swapping, asset downloads, color format switching, and higher annotation limits.",
  },
  {
    q: 'How much does a paid plan cost?',
    a: 'Pro is $9/month ($90/year) and unlocks site-wide color and font swapping, asset downloads, color format switching, and 10 annotations per site per day. Max is $19/month ($190/year) and adds unlimited annotations and unlimited client review links. Paying yearly works out to two months free versus monthly.',
  },
  {
    q: 'Can I upgrade, downgrade, or cancel anytime?',
    a: "Yes. You can switch between Free, Pro, and Max whenever you like, and manage everything — invoices, payment methods, cancellations — from your account portal. If you cancel, you keep your paid features until the end of the billing period you've already paid for, then drop back to Free automatically.",
  },
  {
    q: 'What happens to my annotations if I hit the plan limit?',
    a: 'Annotation limits are per site and reset every 24 hours (3 a day on Free, 10 on Pro, unlimited on Max). Reaching the limit only pauses adding new pins on that site for the day, your existing annotations are always saved and stay fully editable and shareable.',
  },
  {
    q: 'Will Sparrow change or break the websites I use it on?',
    a: 'Never. Everything Sparrow does — including recoloring a page or swapping its fonts is a local preview that only you see. The real website is untouched, and one click resets any experiment.',
  },
  {
    q: 'How does sharing feedback work?',
    a: "Pin your comments, click Share, and send the link. Anyone who opens it sees your annotations in place on the page and can reply or resolve items with live cursors when you're reviewing together. Share links expire after 3 days for safety, but your annotations are saved and you can mint a fresh link anytime.",
  },
  {
    q: 'Can clients mess up my annotations?',
    a: "No. People who join through your link enter Client Mode: they can comment, reply, and change an item's status, but they can't edit or delete your notes.",
  },
  {
    q: 'Which sites and environments does it work on?',
    a: "Any page your browser can open: live production sites, staging environments, and localhost. There's nothing to install on the website itself.",
  },
  {
    q: 'Does it understand Tailwind CSS?',
    a: 'Yes, When an element is styled with Tailwind utilities, Sparrow shows the class list separately from the rest of the CSS and lets you copy the classes in one click.',
  },
  {
    q: 'I want to test my own brand font. Is uploading it safe?',
    a: 'Yes, uploaded fonts are registered directly in your browser and are never sent to a server. They apply for your current session only.',
  },
]

export function FaqSection() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" aria-labelledby="faq-heading" className="py-16 md:py-24">
      <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <h2
          id="faq-heading"
          className="font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl"
        >
          Questions?<br className="hidden md:block" />{' '}
          <span className="hl-word text-sparrow-blue font-pacifico">Answered</span>.
        </h2>

        <div className="flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i
            return (
              <div
                key={item.q}
                className={cn(
                  'overflow-hidden rounded-[15px] bg-white',
                  isOpen
                    ? 'border-[3px] border-dashed border-sparrow-blue'
                    : 'ring-1 ring-black/5',
                )}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-abeezee text-lg font-medium text-black"
                >
                  <span>{item.q}</span>
                  {isOpen ? (
                    <Minus className="size-6 shrink-0 text-sparrow-blue" />
                  ) : (
                    <Plus className="size-6 shrink-0 text-sparrow-ink/60" />
                  )}
                </button>
                <div
                  id={`faq-panel-${i}`}
                  className={cn(
                    'grid transition-all duration-200',
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 font-abeezee text-base leading-relaxed text-sparrow-ink/70">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
