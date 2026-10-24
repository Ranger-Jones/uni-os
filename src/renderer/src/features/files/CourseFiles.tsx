import { useQuery } from '@tanstack/react-query'
import { ExternalLink, File, FileImage, FileText, FolderSearch, MoreHorizontal, Pencil, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useUi } from '../../lib/store'
import { useState } from 'react'
import { toast } from 'sonner'
import type { FileMeta } from '@core/repo/files'
import { Button } from '../../components/ui/Button'
import { confirm } from '../../components/ui/confirm'
import { prompt } from '../../components/ui/prompt'
import { EmptyState } from '../../components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/Menu'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { shortDate } from '../../lib/dates'
import { TagChip, TagEditor } from './FileTags'
import { queryClient, useApiMutation } from '../../lib/queries'

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const iconFor = (mime: string) => (mime === 'application/pdf' || mime.startsWith('text/') ? FileText : mime.startsWith('image/') ? FileImage : File)
const previewable = (mime: string) => mime === 'application/pdf' || mime.startsWith('image/')

export function CourseFiles({ courseId }: { courseId: string }) {
  const list = useQuery({ queryKey: ['files', courseId], queryFn: () => api.files.list({ courseId }) })
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<{ file: FileMeta; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const remove = useApiMutation((id: string) => api.files.remove({ id }))
  const setTags = useApiMutation(({ id, tags }: { id: string; tags: string[] }) => api.files.setTags({ id, tags }))
  const [filter, setFilter] = useState<string | null>(null)
  const ask = useUi((s) => s.askAssistant)

  const importPaths = async (fn: () => Promise<FileMeta[]>) => {
    setBusy(true)
    try {
      const added = await fn()
      if (added.length) toast.success(added.length === 1 ? `Added ${added[0].name}` : `Added ${added.length} files`)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (!dropped.length) return
    void importPaths(async () => {
      const res = await window.bridge.importDroppedFiles(courseId, dropped)
      if (!res.ok) throw new Error(res.error.message)
      return res.data as FileMeta[]
    })
  }

  const openPreview = async (f: FileMeta) => {
    if (!previewable(f.mime)) return void api.files.open({ id: f.id })
    setPreview({ file: f, url: await api.files.url({ id: f.id }) })
  }

  const all = list.data ?? []
  const tagCounts = new Map<string, number>()
  for (const f of all) for (const t of f.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  const knownTags = [...tagCounts.keys()].sort()
  const files = filter ? all.filter((f) => f.tags.includes(filter)) : all

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
      className={cn('relative min-h-64 rounded-lg', dragging && 'outline-2 outline-offset-4 outline-accent outline-dashed')}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted">{all.length ? `${all.length} file${all.length > 1 ? 's' : ''}. Drop files here to add more.` : 'Drop lecture slides, scripts or exercise sheets here.'}</p>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void importPaths(() => api.files.importDialog({ courseId }))}>
          <Upload size={14} /> {busy ? 'Adding…' : 'Add files'}
        </Button>
      </div>

      {knownTags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button onClick={() => setFilter(null)} className={cn('h-5 rounded-full px-2 text-[11.5px] font-medium', filter === null ? 'bg-ink text-paper' : 'text-muted hover:bg-hover')}>
            All {all.length}
          </button>
          {knownTags.map((t) => (
            <TagChip key={t} tag={t} count={tagCounts.get(t)} active={filter === null ? undefined : filter === t} onClick={() => setFilter(filter === t ? null : t)} />
          ))}
        </div>
      )}
      {all.length === 0 && !list.isLoading && <EmptyState icon={<Upload size={28} />} title="No files yet">PDF text is extracted automatically, so you can search it and the assistant can read it.</EmptyState>}

      <div className={cn('grid gap-6', preview ? 'grid-cols-[minmax(0,320px)_1fr]' : 'grid-cols-1')}>
        <ul className="flex flex-col">
          {files.map((f) => {
            const Icon = iconFor(f.mime)
            return (
              <li key={f.id} onClick={() => void openPreview(f)} className={cn('group flex h-10 items-center gap-3 rounded-md px-2 hover:bg-hover', preview?.file.id === f.id && 'bg-active')}>
                <Icon size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <TagEditor tags={f.tags} known={knownTags} onChange={(tags) => setTags.mutate({ id: f.id, tags })} />
                {f.mime === 'application/pdf' && !f.hasText && <span className="rounded bg-hover px-1.5 text-[11px] text-muted" title="No text layer found (scanned PDF?)">no text</span>}
                {!preview && (
                  <>
                    <span className="w-20 text-right text-[12.5px] text-muted tabular-nums">{fmtSize(f.size)}</span>
                    <span className="w-16 text-right text-[12.5px] text-muted">{shortDate(f.createdAt.slice(0, 10))}</span>
                  </>
                )}
                <div onClick={(e) => e.stopPropagation()}>
                  <Menu>
                    <MenuTrigger className="invisible rounded p-1 text-muted group-hover:visible hover:bg-active hover:text-ink" aria-label="File actions">
                      <MoreHorizontal size={15} />
                    </MenuTrigger>
                    <MenuContent align="end">
                      {f.hasText && (
                        <MenuItem icon={<Sparkles size={14} />} onSelect={() => ask(`Explain the key ideas of the file "${f.name}" and list what I should be able to do after studying it.`, courseId)}>
                          Explain with assistant
                        </MenuItem>
                      )}
                      <MenuItem icon={<ExternalLink size={14} />} onSelect={() => void api.files.open({ id: f.id })}>
                        Open in default app
                      </MenuItem>
                      <MenuItem icon={<FolderSearch size={14} />} onSelect={() => void api.files.reveal({ id: f.id })}>
                        Show in Finder
                      </MenuItem>
                      <MenuItem
                        icon={<Pencil size={14} />}
                        onSelect={async () => {
                          const name = await prompt({ title: 'Rename file', initial: f.name, confirmLabel: 'Rename' })
                          if (name && name !== f.name) void api.files.rename({ id: f.id, name }).then(() => queryClient.invalidateQueries())
                        }}
                      >
                        Rename
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        danger
                        icon={<Trash2 size={14} />}
                        onSelect={async () => {
                          if (await confirm({ title: `Delete ${f.name}?`, body: 'The file is removed from your UniOS data folder.', confirmLabel: 'Delete file', danger: true })) {
                            if (preview?.file.id === f.id) setPreview(null)
                            remove.mutate(f.id)
                          }
                        }}
                      >
                        Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </li>
            )
          })}
        </ul>
        {preview && (
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-lg border border-line">
            <div className="flex h-9 items-center justify-between border-b border-line px-3">
              <span className="truncate text-[13px] font-medium">{preview.file.name}</span>
              <span className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label="Open in default app" onClick={() => void api.files.open({ id: preview.file.id })}>
                  <ExternalLink size={14} />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Close preview" onClick={() => setPreview(null)}>
                  <X size={14} />
                </Button>
              </span>
            </div>
            {preview.file.mime.startsWith('image/') ? (
              <div className="flex flex-1 items-center justify-center overflow-auto bg-hover p-4">
                <img src={preview.url} alt={preview.file.name} className="max-h-full max-w-full" />
              </div>
            ) : (
              <iframe title={preview.file.name} src={preview.url} className="flex-1 bg-white" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
