import type { ReactNode } from 'react'
import { Container, Placeholder } from './parts'
import iconChrome from '@/assets/image 4.svg'
import iconFirefox from '@/assets/image 5.svg'
import iconBrave from '@/assets/image 6.svg'
import iconOpera from '@/assets/image 7.svg'
import iconGlobe from '@/assets/image 8.svg'
import iconCursor from '@/assets/image 9.svg'
import step1Image from '@/assets/step1_chrome.png'
import step2Image from '@/assets/step2.jpg'
import step3Image from '@/assets/step3.jpg'

type Step = {
  title: string
  description: string
  icons: ReactNode
  image?: string
}

const STEPS: Step[] = [
  {
    title: 'Add Sparrow to your browser',
    description:
      'Install the extension in seconds and pin it to your toolbar. You can start inspecting right away no setup, no configuration.',
    icons: (
      <>
        <img src={iconChrome} alt="" className="size-7" />
        <img src={iconFirefox} alt="" className="size-7" />
        <img src={iconBrave} alt="" className="size-7" />
        <img src={iconOpera} alt="" className="size-7" />
      </>
    ),
    image: step1Image,
  },
  {
    title: 'Open it on any webpage',
    description:
      "Click the Sparrow icon on any site production, staging, or localhost and the full toolkit appears as an overlay.",
    icons: <img src={iconGlobe} alt="" className="size-7" />,
    image: step2Image,
  },
  {
    title: 'Inspect, annotate & measure',
    description:
      'Switch between Inspect, Annotate, Ruler, Colors, Fonts, and Assets from one rail. Everything happens, so you never lose context.',
    icons: <img src={iconCursor} alt="" className="size-7" />,
    image: step3Image,
  },
]

export function StepsSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="md:py-16 py-5 md:py-24"
    >
      <Container>
        <h2
          id="how-it-works-heading"
          className="text-center font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl"
        >
          Install it once. <span className="hl-word text-sparrow-blue">Use it everywhere.</span>
        </h2>

        {/* On iPad/mobile the three cards become a horizontal, scroll-snap
            slider (each card is a bit narrower than the viewport so the next
            one peeks in, signalling it's swipeable). At lg+ it reverts to the
            static 3-column grid. Scrollbar hidden for a clean carousel look. */}
        <div className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:snap-none lg:grid-cols-3 lg:gap-8 lg:overflow-visible lg:pb-0">
          {STEPS.map((step) => (
            <article
              key={step.title}
              className="flex shrink-0 basis-[82%] snap-start flex-col rounded-[20px] bg-white sm:basis-[56%] md:basis-[44%] lg:basis-auto"
            >
              <div className='px-6 py-10'>
                <div className="flex items-center gap-3">{step.icons}</div>
                <h3 className="mt-5 font-abeezee text-2xl font-semibold text-sparrow-ink">
                  {step.title}
                </h3>
                <p className="mt-2 font-abeezee text-sm leading-relaxed text-sparrow-ink">
                  {step.description}
                </p>
              </div>
              {step.image ? (
                <img
                  src={step.image}
                  alt=""
                  className="aspect-square w-full rounded-b-[20px] object-cover"
                />
              ) : (
                <Placeholder className="aspect-square w-full" label="Preview" />
              )}
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}
