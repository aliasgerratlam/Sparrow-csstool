import { useEffect, useRef } from 'react'
import { Container } from './parts'
import designReviewVideo from '@/assets/design_review.mp4'

/* Autoplays while in view, pauses when scrolled away — matches FeatureRows. */
function FeedbackVideo() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          // play() rejects if interrupted (e.g. element unmounts) — ignore.
          void el.play().catch(() => {})
        } else {
          el.pause()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <video
      ref={ref}
      src={designReviewVideo}
      className="aspect-16/10 w-full rounded-[20px] object-cover"
      loop
      muted
      playsInline
      preload="metadata"
      aria-label="Feedback preview"
    />
  )
}

const COLUMNS = [
  {
    title: 'Comments with coordinates',
    body: "Every note is anchored to a real element on the real page. No more 'the button on the left, no, the other left' the pin is the location.",
  },
  {
    title: 'Safe for clients, structured for you',
    body: "Reviewers join in Client Mode: they can comment, reply, and mark items resolved, but they can't edit or delete your work. You keep a searchable review list with open/resolved counts.",
  },
  {
    title: 'Works where your work lives',
    body: 'Production sites, staging environments, localhost previews. Sparrow runs on all of them without touching your code or your deploy pipeline.',
  },
]

export function FeedbackSection() {
  return (
    <section aria-labelledby="feedback-heading" className="pt-10 pb-16 md:pt-56 md:pb-24">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2
              id="feedback-heading"
              className="font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl"
            >
              <span className="hl-word text-sparrow-blue">Design review</span> without the screenshot circus.
            </h2>
            <p className="mt-6 max-w-xl font-abeezee text-base text-sparrow-ink">
              Send your client one link instead of asking them to describe a bug over
              email. They click the element, write what's wrong, and you get feedback
              pinned to the exact spot on the exact page with element context
              attached, ready to act on or hand to your team.
            </p>
          </div>
          <FeedbackVideo />
        </div>

        <div className='divide-x bg-black/10 rounded-full w-full h-[1px] mt-12' />

        <div className="mt-12 grid gap-8 md:grid-cols-3 md:divide-x md:divide-black/10">
          {COLUMNS.map((col) => (
            <div key={col.title} className="md:px-6 md:first:pl-0 md:last:pr-0">
              <h3 className="font-abeezee text-2xl font-semibold text-sparrow-ink">
                {col.title}
              </h3>
              <p className="mt-3 font-abeezee text-base text-sparrow-ink">
                {col.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
