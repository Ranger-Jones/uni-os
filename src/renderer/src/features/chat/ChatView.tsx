import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { confirm } from '../../components/ui/confirm'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { relativeDay } from '../../lib/dates'
import { useApiMutation } from '../../lib/queries'
import { chatRoute } from '../../router'
import { NewChatPickers, useNewChatDefaults, type NewChatOptions } from './ChatHeader'
import { Conversation } from './Conversation'
import { useChat } from './useChat'

export function useHasKey() {
  const keys = useQuery({ queryKey: ['ai', 'keys'], queryFn: () => api.ai.keyStatus() })
  return !!(keys.data?.anthropic || keys.data?.openai)
}

export function ChatView() {
  const { thread } = chatRoute.useSearch()
  const navigate = useNavigate()
  const threads = useQuery({ queryKey: ['ai', 'threads'], queryFn: () => api.ai.threads() })
  const remove = useApiMutation((id: string) => api.ai.removeThread({ id }))
  const hasKey = useHasKey()
  const defaults = useNewChatDefaults()
  const [opts, setOpts] = useState<NewChatOptions | null>(null)
  useEffect(() => {
    if (defaults && !opts) setOpts(defaults)
  }, [defaults, opts])
  const open = (id?: string) => void navigate({ to: '/chat', search: id ? { thread: id } : {} })
  const chat = useChat(thread ?? null, (id) => open(id))

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line pt-12">
        <div className="px-3 pb-2">
          <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => open()}>
            <MessageSquarePlus size={14} /> New chat
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {threads.data?.map((t) => (
            <li key={t.id}>
              <div onClick={() => open(t.id)} className={cn('group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover', t.id === thread && 'bg-active')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{t.title}</span>
                  <span className="block text-[11.5px] text-faint">{relativeDay(t.updatedAt.slice(0, 10))}</span>
                </span>
                <button
                  className="invisible rounded p-1 text-muted group-hover:visible hover:bg-active hover:text-ink"
                  aria-label="Delete chat"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (await confirm({ title: 'Delete this chat?', confirmLabel: 'Delete', danger: true })) {
                      remove.mutate(t.id)
                      if (t.id === thread) open()
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 pt-10">
        <Conversation
          chat={chat}
          hasKey={hasKey}
          onSend={(text) => void chat.send(text, thread ? {} : (opts ?? {}))}
          header={
            !thread && opts && hasKey ? (
              <div className="no-drag mx-auto w-full max-w-2xl px-8 pt-3">
                <NewChatPickers value={opts} onChange={setOpts} />
              </div>
            ) : chat.thread ? (
              <div className="mx-auto w-full max-w-2xl truncate px-8 pt-3 text-[13px] text-muted">
                {chat.thread.title} <span className="text-faint">· {chat.thread.model}</span>
              </div>
            ) : null
          }
        />
      </div>
    </div>
  )
}
