import { createReactInlineContentSpec } from '@blocknote/react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { api } from '../../lib/api'
import { router } from '../../router'

/** Inline chip linking to another page; shows the page's current title. */
function Chip({ pageId, fallback }: { pageId: string; fallback: string }) {
  const meta = useQuery({ queryKey: ['page', pageId, 'meta'], queryFn: () => api.pages.meta({ id: pageId }), staleTime: 10_000 })
  const missing = meta.isFetched && (!meta.data || meta.data.deleted)
  const title = meta.data?.title || fallback || 'Untitled'
  return (
    <span
      contentEditable={false}
      role="link"
      title={missing ? 'This page was deleted' : `Open ${title}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => !missing && void router.navigate({ to: '/pages/$pageId', params: { pageId } })}
      className={`mx-px inline-flex cursor-pointer items-baseline gap-1 rounded px-1 align-baseline font-medium underline decoration-faint/60 underline-offset-2 hover:bg-hover ${missing ? 'text-faint line-through' : 'text-ink'}`}
    >
      <span className="self-center text-muted">{meta.data?.icon ?? <FileText size={13} className="inline" />}</span>
      {title}
    </span>
  )
}

export const PageMention = createReactInlineContentSpec(
  { type: 'pageMention', propSchema: { pageId: { default: '' }, title: { default: '' } }, content: 'none' },
  { render: ({ inlineContent }) => <Chip pageId={inlineContent.props.pageId} fallback={inlineContent.props.title} /> }
)
