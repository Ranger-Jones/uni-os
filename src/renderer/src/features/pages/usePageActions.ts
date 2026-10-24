import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { useUi } from '../../lib/store'

/** Page commands shared by sidebar, notes tab, page header and command palette. */
export function usePageActions() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const expand = useUi((s) => s.toggleExpanded)
  const refresh = () => qc.invalidateQueries({ queryKey: ['pages'] })

  return {
    async create(opts: { courseId: string | null; parentId?: string | null }) {
      const p = await api.pages.create({ courseId: opts.courseId, parentId: opts.parentId ?? null })
      if (opts.parentId) expand(opts.parentId, true)
      if (opts.courseId) expand(`course:${opts.courseId}`, true)
      await refresh()
      void navigate({ to: '/pages/$pageId', params: { pageId: p.id } })
      return p
    },
    async duplicate(id: string) {
      const p = await api.pages.duplicate({ id })
      await refresh()
      void navigate({ to: '/pages/$pageId', params: { pageId: p.id } })
    },
    async trash(id: string, title: string) {
      await api.pages.trash({ id })
      await qc.invalidateQueries()
      toast(`Moved “${title || 'Untitled'}” to trash`, {
        action: {
          label: 'Undo',
          onClick: () => void api.pages.restore({ id }).then(() => qc.invalidateQueries())
        }
      })
    },
    async move(id: string, patch: { parentId: string | null; courseId?: string | null; sortOrder: number }) {
      try {
        await api.pages.update({ id, patch })
        if (patch.parentId) expand(patch.parentId, true)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
      await refresh()
    }
  }
}
