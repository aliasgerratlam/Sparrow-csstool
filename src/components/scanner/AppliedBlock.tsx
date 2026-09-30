import { Fragment } from 'react'
import type { AppliedDeclaration, AppliedMediaGroup } from '@/lib/types'
import { useColorFormat } from '@/context/color-format'
import { convertColorTokens } from '@/lib/color'
import { RuleRow } from './RuleRow'

function DeclRow({ d, indent }: { d: AppliedDeclaration; indent: boolean }) {
  const format = useColorFormat()
  return (
    <RuleRow
      prop={d.property}
      value={convertColorTokens(d.value, format)}
      source={d.source || undefined}
      sourceTitle={d.source ? `applied by ${d.source}` : undefined}
      indent={indent}
    />
  )
}

/* Flat applied-CSS rows (Tailwind "Other applied CSS" view) with @media groups. */
export function AppliedBlock({
  decls,
  media,
}: {
  decls: AppliedDeclaration[]
  media: AppliedMediaGroup[]
}) {
  return (
    <>
      {decls.map((d, i) => (
        <DeclRow key={i} d={d} indent={false} />
      ))}
      {media.map((g, gi) => (
        <Fragment key={gi}>
          <div className="sp-ip-mq">@media {g.condition}</div>
          {g.decls.map((d, i) => (
            <DeclRow key={i} d={d} indent />
          ))}
        </Fragment>
      ))}
    </>
  )
}
