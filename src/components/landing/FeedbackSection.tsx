import { Container, Placeholder } from './parts'

const COLUMNS = [
  {
    title: 'Client-side feedback',
    body: 'Review live websites, staging environments, or localhost previews and comment on the exact elements that need attention.',
  },
  {
    title: 'Structured handoff',
    body: 'Every comment includes page and element context, making it easy to implement changes yourself or pass the request to your team or AI.',
  },
  {
    title: 'Built for every environment',
    body: 'Collect feedback on live websites, staging deployments, or localhost previews without changing your workflow.',
  },
]

export function FeedbackSection() {
  return (
    <section aria-labelledby="feedback-heading" className="pt-32 pb-16 md:pt-56 md:pb-24">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2
              id="feedback-heading"
              className="font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl"
            >
              <span className="hl-word text-sparrow-blue">Feedback</span> without screenshots.
            </h2>
            <p className="mt-6 max-w-xl font-abeezee text-base text-sparrow-ink">
              Let clients leave feedback directly on your website. They can pin comments
              to specific elements, describe exactly what needs to change, and share
              everything with a single link — no screenshots or endless email threads.
            </p>
          </div>
          <Placeholder label="Feedback preview" className="aspect-16/10 w-full rounded-[20px]" />
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
