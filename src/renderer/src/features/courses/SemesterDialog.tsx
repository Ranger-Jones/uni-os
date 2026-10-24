import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useApiMutation, useSemesters } from '../../lib/queries'

/** German academic calendar presets around today: the running and the next semester. */
function presets(today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const winter = (start: number) => ({
    name: `WS ${String(start).slice(2)}/${String(start + 1).slice(2)}`,
    startDate: `${start}-10-01`,
    endDate: `${start + 1}-03-31`
  })
  const summer = (year: number) => ({ name: `SS ${String(year).slice(2)}`, startDate: `${year}-04-01`, endDate: `${year}-09-30` })
  if (m >= 10) return [winter(y), summer(y + 1)]
  if (m <= 3) return [winter(y - 1), summer(y)]
  return [summer(y), winter(y)]
}

export function SemesterDialog({
  open,
  onOpenChange,
  editId,
  onCreated
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editId?: string
  onCreated?: (id: string) => void
}) {
  const semesters = useSemesters()
  const editing = semesters.data?.find((s) => s.id === editId)
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' })

  useEffect(() => {
    if (!open) return
    if (editing) setForm({ name: editing.name, startDate: editing.startDate, endDate: editing.endDate })
    else setForm(presets()[0])
  }, [open, editing])

  const save = useApiMutation(async () => {
    if (editing) return api.semesters.update({ id: editing.id, patch: form })
    const s = await api.semesters.create(form)
    onCreated?.(s.id)
    return s
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit semester' : 'New semester'}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            {editing ? 'Save changes' : 'Create semester'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!editing && (
          <div className="flex gap-2">
            {presets().map((p) => (
              <button key={p.name} onClick={() => setForm(p)} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-muted hover:bg-hover hover:text-ink">
                {p.name}
              </button>
            ))}
          </div>
        )}
        <Field label="Name">
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="WS 26/27" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Ends">
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
      </div>
    </Dialog>
  )
}
