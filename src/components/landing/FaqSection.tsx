import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import { Container } from './parts'
import { cn } from '@/lib/format'

const FAQS = [
  {
    q: 'What is Sparrow?',
    a: 'Sparrow is a Chrome extension that lets you inspect any website visually, point at exact UI elements, and turn those selections into structured, code-aware context. It helps you see fonts, colors, spacing, assets, and components, then copy everything you need to make or automate UI changes faster.',
  },
  {
    q: 'Do I need to install anything to inspect a page?',
    a: 'Just add the Sparrow extension to your browser and pin it. Open it on any webpage and the full toolkit — inspector, annotations, color extractor, and ruler — is available without leaving the page.',
  },
  {
    q: 'Can I share feedback with my team?',
    a: 'Yes. Pin comments directly on a live page and share a single annotated link. Everyone sees the conversation in context, with page and element details attached to each comment.',
  },
  {
    q: 'Which environments does Sparrow work on?',
    a: 'Live websites, staging environments, and localhost previews all work the same way — no changes to your workflow required.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. The Free plan includes the essential inspection tools, the color extractor, and up to 2 annotations so you can explore Sparrow before upgrading.',
  },
]

export function FaqSection() {
  const [open, setOpen] = useState(0)

  return (
    <section aria-labelledby="faq-heading" className="py-16 md:py-24">
      <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <h2
          id="faq-heading"
          className="font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl"
        >
          Got a<br className="hidden md:block" />{' '}
          <span className="hl-word text-sparrow-blue font-pacifico">Question</span>?
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
