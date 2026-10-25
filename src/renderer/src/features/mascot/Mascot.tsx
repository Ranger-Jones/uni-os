import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Maximize2, MessageSquarePlus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ANIMALS } from '@core/domain/mascot'
import type { View } from '@core/llm/viewContext'
import { modelFor, type LlmProvider } from '@core/settings'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useSettings } from '../../lib/queries'
import { useUi } from '../../lib/store'
import { Conversation } from '../chat/Conversation'
import { useChat } from '../chat/useChat'
import { Figure } from './figures'
import './mascot.css'

const SIZE = { small: 64, medium: 84, large: 108 } as const
const TAB_LABEL: Record<string, string> = { overview: 'Overview', notes: 'Notes', assignments: 'Assignments', files: 'Materials', grades: 'Grades', cards: 'Flashcards', tests: 'Tests' }
const SCREEN_LABEL: Record<string, string> = { '/today': 'Today', '/calendar': 'Calendar', '/grades': 'Grades', '/flashcards': 'Flashcards', '/settings': 'Settings' }

/** The screen the user is on, in the shape the main process describes to the model. */
function useView(): View {
  const loc = useRouterState({ select: (s) => s.location })
  return useMemo(() => {
    const search = loc.search as { tab?: string; test?: string }
    const page = loc.pathname.match(/^\/pages\/([^/]+)/)
    if (page) return { path: loc.pathname, pageId: page[1] }
    const course = loc.pathname.match(/^\/courses\/([^/]+)/)
    if (course) return { path: loc.pathname, courseId: course[1], tab: search.tab ?? 'overview', ...(search.test ? { testId: search.test } : {}) }
    return { path: loc.pathname }
  }, [loc.pathname, loc.search])
}

/** Short label of the current screen for the bubble header, plus fitting suggestions. */
function useViewInfo(view: View): { label: string; suggestions: string[] } {
  const page = useQuery({ queryKey: ['page', view.pageId], queryFn: () => api.pages.get({ id: view.pageId! }), enabled: !!view.pageId })
  const course = useQuery({ queryKey: ['course', view.courseId], queryFn: () => api.courses.get({ id: view.courseId! }), enabled: !!view.courseId })
  const test = useQuery({ queryKey: ['test', view.testId], queryFn: () => api.tests.get({ id: view.testId! }), enabled: !!view.testId })
  if (view.pageId) {
    return {
      label: page.data?.title || 'Untitled page',
      suggestions: ['Summarize this page in 3 points', 'Explain the hardest part simply', 'Quiz me with 3 questions on this page']
    }
  }
  if (view.courseId) {
    if (test.data) return { label: test.data.title, suggestions: ['Give me a hint for the question I am on', 'Which topics does this test cover?'] }
    const name = course.data?.name ?? 'Course'
    return { label: `${name} · ${TAB_LABEL[view.tab ?? 'overview'] ?? view.tab}`, suggestions: ['What is due in this course?', 'What should I revise next?', 'Summarize the latest lecture notes'] }
  }
  return { label: SCREEN_LABEL[view.path] ?? 'UniOS', suggestions: ['What is due this week?', 'What should I study today?'] }
}

/** The study buddy in the bottom-right corner: dances, and answers questions about the screen you are on. */
export function Mascot() {
  const settings = useSettings().data
  const path = useRouterState({ select: (s) => s.location.pathname })
  const { mascotOpen: open, setMascotOpen: setOpen, mascotThreadId: threadId, setMascotThreadId: setThreadId, chatOpen } = useUi()
  const keys = useQuery({ queryKey: ['ai', 'keys'], queryFn: () => api.ai.keyStatus() })
  const navigate = useNavigate()
  const view = useView()
  const info = useViewInfo(view)
  const chat = useChat(threadId, setThreadId)
  const m = settings?.mascot

  // "Sometimes": a short dance every now and then.
  const [burst, setBurst] = useState(false)
  useEffect(() => {
    if (m?.dance !== 'sometimes') return
    let stop: ReturnType<typeof setTimeout> | undefined
    const t = setInterval(() => {
      setBurst(true)
      stop = setTimeout(() => setBurst(false), 5000)
    }, 25_000)
    return () => {
      clearInterval(t)
      clearTimeout(stop)
    }
  }, [m?.dance])

  const shown = !!settings && !!m?.enabled && path !== '/chat'
  const reserve = shown ? (SIZE[m!.size] ?? SIZE.medium) + 16 : 0
  // Other corner widgets (the reading progress of notes) move aside by this much.
  useEffect(() => {
    document.documentElement.style.setProperty('--mascot-space', `${reserve}px`)
    return () => void document.documentElement.style.removeProperty('--mascot-space')
  }, [reserve])

  if (!shown || !settings || !m) return null
  const provider: LlmProvider = m.provider === 'default' ? settings.defaultProvider : m.provider
  const ready = !!keys.data?.[provider]
  const mode = chat.running ? 'think' : open ? 'idle' : m.dance === 'always' || (m.dance === 'sometimes' && burst) ? 'dance' : 'idle'
  const width = SIZE[m.size] ?? SIZE.medium
  const animal = ANIMALS.find((a) => a.id === m.animal)?.label ?? 'Mascot'
  const name = m.name || animal

  const send = (text: string) => void chat.send(text, threadId ? { mascot: { view } } : { provider, model: modelFor(settings, provider), courseId: view.courseId ?? null, mascot: { view } })

  return (
    <div className="mascot no-drag fixed bottom-3 z-40 flex flex-col items-end" style={{ right: chatOpen ? 412 : 16 }} data-mode={mode}>
      {open && (
        <div role="dialog" aria-label={`Chat with ${name}`} className="relative mb-2 flex h-[min(540px,72vh)] w-[380px] flex-col rounded-2xl border border-line bg-raised shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex items-start justify-between gap-2 border-b border-line py-2 pr-2 pl-4">
            <div className="min-w-0 pt-0.5">
              <p className="text-[13.5px] font-semibold">{name}</p>
              <p className="truncate text-[12px] text-muted" title={info.label}>
                Looking at {info.label}
              </p>
            </div>
            <span className="flex shrink-0">
              <Button size="icon" variant="ghost" aria-label="New conversation" title="New conversation" onClick={() => setThreadId(null)}>
                <MessageSquarePlus size={15} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Open in the assistant"
                title="Open in the assistant"
                disabled={!threadId}
                onClick={() => {
                  setOpen(false)
                  void navigate({ to: '/chat', search: threadId ? { thread: threadId } : {} })
                }}
              >
                <Maximize2 size={14} />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Close ${name}`} onClick={() => setOpen(false)}>
                <X size={15} />
              </Button>
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <Conversation
              compact
              chat={chat}
              hasKey={ready}
              onSend={send}
              placeholder={`Ask ${name} about this page…`}
              emptyState={
                <div className="pt-6">
                  <p className="text-[14px]">
                    Hi, I’m {name}! Ask me anything about <span className="font-medium">{info.label}</span> — or any other note, course or deadline.
                  </p>
                  {ready && (
                    <div className="mt-4 flex flex-col items-start gap-1.5">
                      {info.suggestions.map((s) => (
                        <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-left text-[13px] text-muted hover:bg-hover hover:text-ink">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              }
            />
          </div>
          {/* tail of the speech bubble, pointing at the mascot */}
          <span className="absolute -bottom-[7px] h-3.5 w-3.5 rotate-45 border-r border-b border-line bg-raised" style={{ right: width / 2 - 7 }} />
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? `Close ${name}` : `Ask ${name}`}
        title={open ? undefined : `Ask ${name} about this page`}
        className="group relative rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{ width, height: width * 1.25 }}
      >
        {mode === 'think' && (
          <span className="thought absolute -top-1 -left-3 flex gap-0.5 rounded-full border border-line bg-raised px-1.5 py-1 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted" />
          </span>
        )}
        <Figure animal={m.animal} className={cn('figure h-full w-full')} />
      </button>
    </div>
  )
}
