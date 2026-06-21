import { Fragment } from 'react'
import type { AppliedDeclaration, AppliedMediaGroup } from '@/lib/types'

function DeclRow({ d, indent }: { d: AppliedDeclaration; indent: boolean }) {
  return (
    <div className="decl-row" style={indent ? { paddingLeft: 12 } : undefined}>
      <span className="decl-main">
        <span className="decl-key">{d.property}</span>
        <span className="decl-colon">:</span>{' '}
        <span className="decl-value">{d.value}</span>
        <span className="decl-semi">;</span>
      </span>
      {d.source && (
        <span className="decl-source" title="applied by">
          {d.source}
        </span>
      )}
    </div>
  )
}

/* Flat applied-CSS block (Tailwind "Other applied CSS" view) with @media groups. */
export function AppliedBlock({
  decls,
  media,
}: {
  decls: AppliedDeclaration[]
  media: AppliedMediaGroup[]
}) {
  return (
    <div className="applied-css">
      {decls.map((d, i) => (
        <DeclRow key={i} d={d} indent={false} />
      ))}
      {media.map((g, gi) => (
        <Fragment key={gi}>
          <div className="applied-mq">@media {g.condition}</div>
          {g.decls.map((d, i) => (
            <DeclRow key={i} d={d} indent />
          ))}
        </Fragment>
      ))}
    </div>
  )
}
