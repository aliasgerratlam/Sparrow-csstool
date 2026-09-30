import type { RenderBlock } from '@/hooks/use-css-inspection'
import { useColorFormat } from '@/context/color-format'
import { convertColorTokens } from '@/lib/color'
import { RuleRow } from './RuleRow'

/* One matched rule, flattened into declaration rows (cascade strike-through
   preserved). The right-hand label is the rule's selector — or, for :hover /
   ::before style blocks (whose selector the model folds into `heading`), a badge
   plus the stylesheet they came from. */
export function RuleBlock({ block }: { block: RenderBlock }) {
  const format = useColorFormat()
  const isStateLike = block.variant === 'state' || block.variant === 'pseudo'
  const inactive = block.variant === 'inactive'

  const badge = isStateLike ? block.heading : block.badge
  const source = isStateLike
    ? block.source
    : block.variant === 'inline'
      ? 'element.style'
      : block.heading
  const sourceTitle = isStateLike
    ? `${block.heading} — ${block.source}`
    : block.source
      ? `${block.heading} — ${block.source}`
      : block.heading

  return (
    <>
      {block.mediaNote && <div className="sp-ip-mq">{block.mediaNote}</div>}
      {block.decls.map((d, i) => (
        <RuleRow
          key={i}
          prop={d.property}
          value={convertColorTokens(d.value, format)}
          swatch={d.swatch}
          badge={badge}
          source={source}
          sourceTitle={sourceTitle}
          overridden={d.overridden}
          dim={inactive}
        />
      ))}
    </>
  )
}
