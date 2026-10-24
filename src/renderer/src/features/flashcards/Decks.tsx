import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Layers, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CardRow } from '@core/repo/cards'
import { Button } from '../../components/ui/Button'
import { confirm } from '../../components/ui/confirm'
import { EmptyState } from '../../components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/Menu'
import { prompt } from '../../components/ui/prompt'
import { api } from '../../lib/api'
import { courseColor } from '../../lib/colors'
import { useApiMutation } from '../../lib/queries'
import { useAllCourses } from '../../lib/queries-schedule'
import { DeckDetail } from './DeckDetail'
import { Review } from './Review'

/** Deck overview with review and editing; shared by the Flashcards view and the course tab. */
export function Decks({ courseId }: { courseId?: string }) {
  const decks = useQuery({ queryKey: ['decks', courseId ?? 'all'], queryFn: () => api.cards.decks(courseId ? { courseId } : {}) })
  const courses = useAllCourses()
  const [open, setOpen] = useState<string | null>(null)
  const [review, setReview] = useState<CardRow[] | null>(null)
  const create = useApiMutation((name: string) => api.cards.createDeck({ courseId: courseId ?? null, name }))
  const remove = useApiMutation((id: string) => api.cards.removeDeck({ id }))
  const all = decks.data ?? []
  const totalDue = all.reduce((s, d) => s + d.dueCount, 0)

  const startReview = async (deckIds: string[]) => {
    const due = await api.cards.due({ deckIds })
    if (due.length) setReview(due)
  }

  if (review) return <Review cards={review} onDone={() => setReview(null)} />
  const openDeck = all.find((d) => d.id === open)
  if (openDeck)
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setOpen(null)} className="flex items-center gap-1 rounded px-1 text-[13px] text-muted hover:bg-hover hover:text-ink">
            <ChevronLeft size={14} /> All decks
          </button>
          <Button size="sm" variant="primary" disabled={!openDeck.dueCount} onClick={() => void startReview([openDeck.id])}>
            Review {openDeck.dueCount} due
          </Button>
        </div>
        <h2 className="mb-4 font-serif text-2xl font-semibold">{openDeck.name}</h2>
        <DeckDetail deckId={openDeck.id} />
      </div>
    )

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-muted">{totalDue ? `${totalDue} card${totalDue === 1 ? '' : 's'} due for review` : all.length ? 'Nothing due right now.' : ''}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              const name = await prompt({ title: 'New deck', initial: '', confirmLabel: 'Create deck' })
              if (name) create.mutate(name)
            }}
          >
            <Plus size={14} /> New deck
          </Button>
          <Button size="sm" variant="primary" disabled={!totalDue} onClick={() => void startReview(all.filter((d) => d.dueCount).map((d) => d.id))}>
            Review all due
          </Button>
        </div>
      </div>
      {all.length === 0 && !decks.isLoading && (
        <EmptyState icon={<Layers size={28} />} title="No flashcards yet">
          Create a deck, or open a note page and choose “Generate flashcards” to let the assistant write them.
        </EmptyState>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {all.map((d) => {
          const course = courses.data?.find((c) => c.id === d.courseId)
          return (
            <div key={d.id} onClick={() => setOpen(d.id)} className="group relative flex min-h-28 flex-col rounded-xl border border-line bg-raised p-4 hover:border-faint">
              {course && (
                <span className="mb-1 flex items-center gap-1.5 text-[12px] text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: courseColor(course.color).solid }} />
                  {course.name}
                </span>
              )}
              <span className="font-medium">{d.name}</span>
              <span className="mt-auto flex items-baseline gap-2 pt-3 text-[13px]">
                <span className={d.dueCount ? 'font-serif text-xl font-semibold text-accent tabular-nums' : 'font-serif text-xl font-semibold text-faint tabular-nums'}>{d.dueCount}</span>
                <span className="text-muted">due · {d.totalCount} cards</span>
              </span>
              <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                <Menu>
                  <MenuTrigger className="invisible rounded p-1 text-muted group-hover:visible hover:bg-hover hover:text-ink" aria-label="Deck actions">
                    <MoreHorizontal size={15} />
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem
                      danger
                      icon={<Trash2 size={14} />}
                      onSelect={async () => (await confirm({ title: `Delete ${d.name}?`, body: `${d.totalCount} cards will be deleted.`, confirmLabel: 'Delete deck', danger: true })) && remove.mutate(d.id)}
                    >
                      Delete deck
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
              {d.dueCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void startReview([d.id])
                  }}
                  className="absolute right-3 bottom-3 rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent hover:brightness-95"
                >
                  Review
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
