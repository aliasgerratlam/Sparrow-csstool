import type { ReactNode } from 'react'
import { Container, Placeholder } from './parts'
import iconChrome from '@/assets/image 4.svg'
import iconFirefox from '@/assets/image 5.svg'
import iconBrave from '@/assets/image 6.svg'
import iconOpera from '@/assets/image 7.svg'
import iconGlobe from '@/assets/image 8.svg'
import iconCursor from '@/assets/image 9.svg'

type Step = {
  title: string
  description: string
  icons: ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Add it to your browser',
    description:
      'Install the extension and pin it to your toolbar for quick access.',
    icons: (
      <>
        <img src={iconChrome} alt="" className="size-7" />
        <img src={iconFirefox} alt="" className="size-7" />
        <img src={iconBrave} alt="" className="size-7" />
        <img src={iconOpera} alt="" className="size-7" />
      </>
    ),
  },
  {
    title: 'Open it on any webpage',
    description:
      'Click the Sparrow icon in your browser to launch the toolkit whenever you need it on any website.',
    icons: <img src={iconGlobe} alt="" className="size-7" />,
  },
  {
    title: 'Inspect, annotate & measure',
    description:
      'Switch between CSS Inspector, Annotations, Color Extractor, and Ruler without leaving the page.',
    icons: <img src={iconCursor} alt="" className="size-7" />,
  },
]

export function StepsSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="py-16 md:py-24"
    >
      <Container>
        <h2
          id="how-it-works-heading"
          className="text-center font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl"
        >
          Install it. Open it. <span className="hl-word text-sparrow-blue">Start inspecting.</span>
        </h2>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <article
              key={step.title}
              className="flex flex-col rounded-[20px] bg-white "
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
              <Placeholder className="aspect-square w-full" label="Preview" />
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}
