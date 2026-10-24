import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Input'
import { confirm } from '../../components/ui/confirm'
import { api } from '../../lib/api'
import { useApiMutation } from '../../lib/queries'
import { EditCell } from '../grades/CourseGrades'

export function DeckDetail({ deckId }: { deckId: string }) {
  const list = useQuery({ queryKey: ['cards', deckId], queryFn: () => api.cards.list({ deckId }) })
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const add = useApiMutation(() => api.cards.create({ deckId, front, back }))
  const update = useApiMutation((p: { id: string; front?: string; back?: string }) => api.cards.update(p))
  const remove = useApiMutation((id: string) => api.cards.remove({ id }))

  return (
    <div>
      <div className="mb-6 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <Textarea className="min-h-16" placeholder="Front — question" value={front} onChange={(e) => setFront(e.target.value)} />
        <Textarea className="min-h-16" placeholder="Back — answer" value={back} onChange={(e) => setBack(e.target.value)} />
        <Button
          variant="primary"
          disabled={!front.trim() || !back.trim()}
          onClick={() =>
            add.mutate(undefined, {
              onSuccess: () => {
                setFront('')
                setBack('')
              }
            })
          }
        >
          Add card
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_5rem_2rem] gap-x-2 border-b border-line pb-1 text-[12px] text-muted">
        <span className="px-2">Front</span>
        <span className="px-2">Back</span>
        <span className="text-right">Reviews</span>
        <span />
      </div>
      {list.data?.map((c) => (
        <div key={c.id} className="group grid grid-cols-[1fr_1fr_5rem_2rem] items-center gap-x-2 border-b border-line/60 py-0.5">
          <EditCell value={c.front} onCommit={(front) => front.trim() && update.mutate({ id: c.id, front })} />
          <EditCell value={c.back} onCommit={(back) => back.trim() && update.mutate({ id: c.id, back })} />
          <span className="text-right text-[12.5px] text-muted tabular-nums">{c.reps}</span>
          <button
            className="invisible rounded p-1 text-muted group-hover:visible hover:bg-hover hover:text-ink"
            aria-label="Delete card"
            onClick={async () => (await confirm({ title: 'Delete this card?', confirmLabel: 'Delete', danger: true })) && remove.mutate(c.id)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {list.data?.length === 0 && <p className="py-4 text-[13px] text-muted">No cards yet. Add some above or generate them from a note page.</p>}
    </div>
  )
}
