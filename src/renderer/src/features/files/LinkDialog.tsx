import { useEffect, useState } from 'react'
import { titleFromUrl } from '@core/domain/links'
import type { CourseLink } from '@core/repo/links'
import { isSafeExternalUrl } from '@core/url'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Textarea } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useApiMutation } from '../../lib/queries'
import { TagEditor } from './FileTags'

export function LinkDialog({ open, onOpenChange, courseId, link, knownTags }: { open: boolean; onOpenChange: (o: boolean) => void; courseId: string; link?: CourseLink; knownTags: string[] }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setUrl(link?.url ?? '')
    setTitle(link?.title ?? '')
    setNote(link?.note ?? '')
    setTags(link?.tags ?? [])
  }, [open, link])

  const normalized = url.trim() && !/^[a-z]+:\/\//i.test(url.trim()) ? `https://${url.trim()}` : url.trim()
  const valid = isSafeExternalUrl(normalized)
  const save = useApiMutation(() =>
    link
      ? api.links.update({ id: link.id, patch: { url: normalized, title: title.trim() || titleFromUrl(normalized), note: note || null, tags } })
      : api.links.create({ courseId, url: normalized, title: title.trim() || null, note: note || null, tags })
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={link ? 'Edit link' : 'Add link'}
      description="Course website, lecture recording, paper, tool — anything with a URL."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            {link ? 'Save changes' : 'Add link'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="URL" hint={url && !valid ? 'Enter a web address starting with http:// or https://' : undefined}>
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Name">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={valid ? titleFromUrl(normalized) : 'e.g. Lecture recordings'} />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-muted">Tags</span>
          <div className="flex">
            <TagEditor tags={tags} known={knownTags} onChange={setTags} />
          </div>
        </div>
        <Field label="Note">
          <Textarea className="min-h-14" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — password hint, which chapters matter, …" />
        </Field>
      </div>
    </Dialog>
  )
}
