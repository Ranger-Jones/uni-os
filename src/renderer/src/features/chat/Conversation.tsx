import { Link } from '@tanstack/react-router'
import { ArrowUp, Check, CircleAlert, Loader2, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DisplayMessage, DisplayPart } from '@core/llm/display'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'
import { Markdown } from './Markdown'
import { toolHint, toolLabel } from './toolLabels'
import type { useChat } from './useChat'
import { useAllCourses } from '../../lib/queries-schedule'

function ToolChip({ part }: { part: Extract<DisplayPart, { type: 'tool' }> }) {
  const icon =
    part.status === 'pending' ? <Loader2 size={12} className="animate-spin" /> : part.status === 'ok' ? <Check size={12} className="text-ok" /> : part.status === 'declined' ? <X size={12} className="text-muted" /> : <CircleAlert size={12} className="text-danger" />
  return (
    <div className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[12px] text-muted">
      {icon}
      <span className={cn(part.status === 'declined' && 'line-through')}>{toolLabel(part.name)}</span>
      <span className="truncate text-faint">{toolHint(part.input)}</span>
    </div>
  )
}

function Message({ m }: { m: DisplayMessage }) {
  if (m.role === 'user') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
    return (
      <div className="flex justify-end">
        <div className="selectable max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-[14px] whitespace-pre-wrap">{text}</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start">
      {m.parts.map((p, i) => (p.type === 'text' ? <Markdown key={i} text={p.text} /> : <ToolChip key={p.id} part={p} />))}
    </div>
  )
}

function ApprovalCard({ approval, onDecide }: { approval: { name: string; input: unknown }; onDecide: (ok: boolean) => void }) {
  const courses = useAllCourses()
  const entries = Object.entries((approval.input ?? {}) as Record<string, unknown>).map(([k, v]): [string, unknown] =>
    k === 'course_id' ? ['course', courses.data?.find((c) => c.id === v)?.name ?? v] : [k, v]
  )
  return (
    <div className="rounded-xl border border-accent/40 bg-raised p-3 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <div className="mb-2 text-[13px] font-medium">{toolLabel(approval.name)}?</div>
      <dl className="mb-3 grid max-h-56 grid-cols-[auto_1fr] gap-x-3 gap-y-1 overflow-y-auto text-[12.5px]">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k.replace(/_/g, ' ')}</dt>
            <dd className="selectable break-words whitespace-pre-wrap">{typeof v === 'string' ? (v.length > 600 ? v.slice(0, 600) + '…' : v) : JSON.stringify(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDecide(false)}>
          Reject
        </Button>
        <Button size="sm" variant="primary" onClick={() => onDecide(true)} autoFocus>
          Apply
        </Button>
      </div>
    </div>
  )
}

export const SUGGESTIONS = ['What is due this week?', 'Summarize my latest notes', 'How is my grade average looking?', 'Plan my study week around my timetable']

export function Conversation({
  chat,
  onSend,
  compact,
  hasKey,
  header,
  draft,
  emptyState,
  placeholder = 'Ask about your courses…'
}: {
  chat: ReturnType<typeof useChat>
  onSend: (text: string) => void
  compact?: boolean
  hasKey: boolean
  header?: React.ReactNode
  draft?: string
  /** Replaces the default welcome text of an empty chat. */
  emptyState?: React.ReactNode
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (draft) {
      setText(draft)
      input.current?.focus()
    }
  }, [draft])

  const lastText = chat.messages.at(-1)?.parts.at(-1)
  useEffect(() => {
    // scrollIntoView returns a Promise in current Chromium — never return it as effect cleanup
    void end.current?.scrollIntoView({ block: 'end' })
  }, [chat.messages.length, lastText, chat.approval])

  const submit = () => {
    const t = text.trim()
    if (!t || chat.running) return
    onSend(t)
    setText('')
  }

  const waiting = chat.running && !chat.approval && (chat.messages.at(-1)?.role !== 'assistant' || chat.messages.at(-1)?.parts.at(-1)?.type === 'tool')

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-4' : 'px-8')}>
        <div className={cn('mx-auto flex flex-col gap-4 py-6', !compact && 'max-w-2xl')}>
          {chat.messages.length === 0 && !chat.running && emptyState}
          {chat.messages.length === 0 && !chat.running && !emptyState && (
            <div className="pt-[8vh] text-center">
              <p className="font-serif text-2xl font-semibold">How can I help with your studies?</p>
              <p className="mt-1 text-[13px] text-muted">The assistant can read your notes, files, deadlines and grades. Changes need your approval.</p>
              {hasKey && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => onSend(s)} className="rounded-full border border-line px-3 py-1 text-[13px] text-muted hover:bg-hover hover:text-ink">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {chat.messages.map((m, i) => (
            <Message key={i} m={m} />
          ))}
          {waiting && (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Loader2 size={14} className="animate-spin" /> Thinking…
            </div>
          )}
          {chat.approval && <ApprovalCard approval={chat.approval} onDecide={chat.decide} />}
          {chat.notice && <p className="rounded-lg bg-hover px-3 py-2 text-[13px] text-muted">{chat.notice}</p>}
          {chat.error && <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{chat.error}</p>}
          <div ref={end} />
        </div>
      </div>
      <div className={cn('border-t border-line py-3', compact ? 'px-3' : 'px-8')}>
        {!hasKey ? (
          <p className="mx-auto max-w-2xl text-center text-[13px] text-muted">
            Add an Anthropic or OpenAI API key, or choose a local model, in{' '}
            <Link to="/settings" className="text-accent underline">
              Settings
            </Link>{' '}
            to use the assistant.
          </p>
        ) : (
          <div className={cn('mx-auto flex items-end gap-2 rounded-xl border border-line bg-raised p-1.5 focus-within:border-accent', !compact && 'max-w-2xl')}>
            <textarea
              ref={input}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={placeholder}
              className={cn('max-h-40 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] outline-none placeholder:text-faint', text.split('\n').length < 7 && 'overflow-hidden')}
              style={{ height: Math.min(160, 32 + (text.split('\n').length - 1) * 20) }}
            />
            {chat.running ? (
              <Button size="icon" variant="secondary" onClick={chat.stop} aria-label="Stop" className="h-8 w-8">
                <Square size={12} fill="currentColor" />
              </Button>
            ) : (
              <Button size="icon" variant="primary" onClick={submit} disabled={!text.trim()} aria-label="Send" className="h-8 w-8">
                <ArrowUp size={16} />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
