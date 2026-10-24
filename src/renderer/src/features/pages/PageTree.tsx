import { useNavigate, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Copy, FileText, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { PageNode } from '@core/repo/pages'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/Menu'
import { cn } from '../../lib/cn'
import { usePageTree } from '../../lib/queries'
import { useUi } from '../../lib/store'
import { usePageActions } from './usePageActions'

type DropPos = 'before' | 'inside' | 'after'

/** Sort order for dropping next to `target` among its siblings. */
function siblingOrder(siblings: PageNode[], target: PageNode, pos: 'before' | 'after'): number {
  const i = siblings.findIndex((s) => s.id === target.id)
  const neighbour = pos === 'before' ? siblings[i - 1] : siblings[i + 1]
  if (!neighbour) return target.sortOrder + (pos === 'before' ? -1 : 1)
  return (target.sortOrder + neighbour.sortOrder) / 2
}

export function PageTree({ courseId, depth = 0, emptyHint }: { courseId: string | null; depth?: number; emptyHint?: string }) {
  const tree = usePageTree(courseId)
  const nodes = tree.data ?? []
  if (nodes.length === 0 && emptyHint) return <div className="py-1 text-[13px] text-faint" style={{ paddingLeft: 8 + depth * 14 }}>{emptyHint}</div>
  return <Nodes nodes={nodes} all={nodes} depth={depth} courseId={courseId} />
}

function Nodes({ nodes, all, depth, courseId }: { nodes: PageNode[]; all: PageNode[]; depth: number; courseId: string | null }) {
  return (
    <>
      {nodes.map((n) => (
        <Node key={n.id} node={n} siblings={nodes} all={all} depth={depth} courseId={courseId} />
      ))}
    </>
  )
}

function Node({ node, siblings, all, depth, courseId }: { node: PageNode; siblings: PageNode[]; all: PageNode[]; depth: number; courseId: string | null }) {
  const navigate = useNavigate()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const open = useUi((s) => !!s.expanded[node.id])
  const toggle = useUi((s) => s.toggleExpanded)
  const actions = usePageActions()
  const [drop, setDrop] = useState<DropPos | null>(null)
  const active = path === `/pages/${node.id}`

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('application/x-unios-page')
    setDrop(null)
    if (!id || id === node.id || !drop) return
    if (drop === 'inside') void actions.move(id, { parentId: node.id, sortOrder: (node.children.at(-1)?.sortOrder ?? 0) + 1 })
    else void actions.move(id, { parentId: node.parentId, courseId: node.courseId, sortOrder: siblingOrder(siblings, node, drop) })
  }

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-unios-page', node.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const y = (e.clientY - r.top) / r.height
          setDrop(y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside')
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={() => void navigate({ to: '/pages/$pageId', params: { pageId: node.id } })}
        className={cn(
          'group relative flex h-7 items-center gap-1 rounded-md pr-1 text-[13.5px] text-ink/85 hover:bg-hover',
          active && 'bg-active font-medium text-ink',
          drop === 'inside' && 'bg-accent-soft'
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {drop === 'before' && <span className="absolute inset-x-1 top-0 h-0.5 rounded bg-accent" />}
        {drop === 'after' && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded bg-accent" />}
        <button
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-active hover:text-ink"
          onClick={(e) => {
            e.stopPropagation()
            toggle(node.id)
          }}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <span className="flex w-4 shrink-0 justify-center text-[13px]">{node.icon ?? <FileText size={14} className="text-muted" />}</span>
        <span className={cn('flex-1 truncate', !node.title && 'text-faint')}>{node.title || 'Untitled'}</span>
        <div className="hidden items-center group-hover:flex" onClick={(e) => e.stopPropagation()}>
          <Menu>
            <MenuTrigger className="rounded p-0.5 text-muted hover:bg-active hover:text-ink" aria-label="Page actions">
              <MoreHorizontal size={14} />
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Copy size={14} />} onSelect={() => void actions.duplicate(node.id)}>
                Duplicate
              </MenuItem>
              <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => void actions.trash(node.id, node.title)}>
                Move to trash
              </MenuItem>
            </MenuContent>
          </Menu>
          <button className="rounded p-0.5 text-muted hover:bg-active hover:text-ink" aria-label="Add sub-page" onClick={() => void actions.create({ courseId, parentId: node.id })}>
            <Plus size={14} />
          </button>
        </div>
      </div>
      {open &&
        (node.children.length > 0 ? (
          <Nodes nodes={node.children} all={all} depth={depth + 1} courseId={courseId} />
        ) : (
          <div className="py-0.5 text-[12.5px] text-faint" style={{ paddingLeft: 30 + (depth + 1) * 14 }}>
            No pages inside
          </div>
        ))}
    </div>
  )
}
