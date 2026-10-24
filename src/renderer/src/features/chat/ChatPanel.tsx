import { useNavigate } from '@tanstack/react-router'
import { Maximize2, MessageSquarePlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useUi } from '../../lib/store'
import { NewChatPickers, useNewChatDefaults, type NewChatOptions } from './ChatHeader'
import { useHasKey } from './ChatView'
import { Conversation } from './Conversation'
import { useChat } from './useChat'

/** Assistant side panel (⌘J), available on every screen. */
export function ChatPanel() {
  const { chatThreadId, setChatThreadId, setChatOpen, chatDraft } = useUi()
  const navigate = useNavigate()
  const hasKey = useHasKey()
  const defaults = useNewChatDefaults()
  const [opts, setOpts] = useState<NewChatOptions | null>(null)
  useEffect(() => {
    if (defaults && !opts) setOpts(defaults)
  }, [defaults, opts])
  useEffect(() => {
    if (chatDraft && defaults) setOpts({ ...defaults, ...(opts ?? {}), courseId: chatDraft.courseId })
  }, [chatDraft]) // eslint-disable-line react-hooks/exhaustive-deps
  const chat = useChat(chatThreadId, setChatThreadId)

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-line bg-paper">
      <div className="drag flex h-11 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
        <span className="truncate text-[13px] font-medium">{chat.thread?.title ?? 'Assistant'}</span>
        <span className="no-drag flex">
          <Button size="icon" variant="ghost" aria-label="New chat" title="New chat" onClick={() => setChatThreadId(null)}>
            <MessageSquarePlus size={15} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Open full chat"
            title="Open full chat"
            onClick={() => {
              setChatOpen(false)
              void navigate({ to: '/chat', search: chatThreadId ? { thread: chatThreadId } : {} })
            }}
          >
            <Maximize2 size={14} />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Close assistant" onClick={() => setChatOpen(false)}>
            <X size={15} />
          </Button>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Conversation
          compact
          chat={chat}
          hasKey={hasKey}
          draft={chatDraft ? chatDraft.text : undefined}
          onSend={(text) => void chat.send(text, chatThreadId ? {} : (opts ?? {}))}
          header={
            !chatThreadId && opts && hasKey ? (
              <div className="px-4 pt-3">
                <NewChatPickers value={opts} onChange={setOpts} />
              </div>
            ) : null
          }
        />
      </div>
    </aside>
  )
}
