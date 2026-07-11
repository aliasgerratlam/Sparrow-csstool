import { Fragment } from 'react'
import type { AppliedDeclaration, AppliedMediaGroup } from '@/lib/types'
import { useColorFormat } from '@/context/color-format'
import { convertColorTokens } from '@/lib/color'

function DeclRow({ d, indent }: { d: AppliedDeclaration; indent: boolean }) {
  const format = useColorFormat()
  return (
    <div className="decl-row" style={indent ? { paddingLeft: 12 } : undefined}>
      <span className="decl-main">
        <span className="decl-key">{d.property}</span>
        <span className="decl-colon">:</span>{' '}
        <span className="decl-value">{convertColorTokens(d.value, format)}</span>
        <span className="decl-semi">;</span>
      </span>
      {d.source && (
        <span className="decl-source" title={`applied by ${d.source}`}>
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
