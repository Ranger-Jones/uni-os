import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { queryClient } from '../../lib/queries'
import { Markdown } from '../chat/Markdown'

export function GenerateCardsDialog({ open, onOpenChange, page }: { open: boolean; onOpenChange: (o: boolean) => void; page: { id: string; title: string; courseId: string | null } }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [cards, setCards] = useState<{ front: string; back: string; keep: boolean }[]>([])
  const [error, setError] = useState('')
  const [deck, setDeck] = useState('')

  useEffect(() => {
    if (!open) return
    setDeck(page.title || 'Notes')
    setState('loading')
    api.cards
      .generate({ pageId: page.id })
      .then((list) => {
        setCards(list.map((c) => ({ ...c, keep: true })))
        setState('ready')
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setState('error')
      })
  }, [open, page.id, page.title])

  const save = async () => {
    const d = await api.cards.findOrCreateDeck({ courseId: page.courseId, name: deck })
    const items = cards.filter((c) => c.keep).map(({ front, back }) => ({ front, back }))
    await api.cards.createMany({ deckId: d.id, items, sourcePageId: page.id })
    await queryClient.invalidateQueries()
    toast.success(`Added ${items.length} cards to ${d.name}`)
    onOpenChange(false)
  }

  const kept = cards.filter((c) => c.keep).length
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate flashcards"
      description="Review the suggestions and untick the ones you don't want."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={state !== 'ready' || !kept || !deck.trim()} onClick={() => void save()}>
            Add {kept} card{kept === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {state === 'loading' && <p className="py-10 text-center text-[13px] text-muted">The assistant is reading your notes…</p>}
      {state === 'error' && <p className="py-6 text-[13px] text-danger">{error}</p>}
      {state === 'ready' && (
        <div className="flex flex-col gap-3">
          <Field label="Deck">
            <Input value={deck} onChange={(e) => setDeck(e.target.value)} />
          </Field>
          <ul className="flex flex-col divide-y divide-line">
            {cards.map((c, i) => (
              <li key={i} className="flex gap-3 py-2.5">
                <input type="checkbox" className="mt-1" checked={c.keep} onChange={(e) => setCards((cs) => cs.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} aria-label="Keep card" />
                <div className="grid flex-1 grid-cols-2 gap-4 text-[13px]">
                  <div className="font-medium">
                    <Markdown text={c.front} />
                  </div>
                  <div className="text-muted">
                    <Markdown text={c.back} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}
