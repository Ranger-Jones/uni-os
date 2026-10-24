import * as P from '@radix-ui/react-popover'
import { useState, type ReactNode } from 'react'

const EMOJIS =
  '📘 📗 📕 📙 📓 📔 📒 📚 📖 ✏️ 📝 🖊️ 📐 📏 🧮 🔢 ➗ ∑ 🧪 🔬 🧬 ⚗️ 🧫 🔭 🌍 🗺️ 🏛️ ⚖️ 💼 📊 📈 💰 🏦 💻 🖥️ ⌨️ 🤖 🧠 💡 ⚙️ 🔧 🔌 📡 🛰️ 🎨 🎭 🎵 🎬 📷 🗣️ 🌐 🇩🇪 🇬🇧 🇫🇷 🇪🇸 🏥 💊 🩺 🌱 🌳 🐾 ⚡ 🔥 💧 ⭐ 🎯 🚀 🧩 📌 📎 🗂️ 📁 🗓️ ⏰ ✅ ❓ ❗ 💬'.split(' ')

export function EmojiPicker({ value, onChange, children }: { value?: string | null; onChange: (e: string | null) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pick = (e: string | null) => {
    onChange(e)
    setOpen(false)
  }
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild>{children}</P.Trigger>
      <P.Portal>
        <P.Content sideOffset={6} align="start" className="z-50 w-72 rounded-lg border border-line bg-raised p-2 shadow-[0_8px_28px_rgba(0,0,0,0.14)]">
          <div className="grid grid-cols-9 gap-0.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => pick(e)}
                className={`flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-hover ${value === e ? 'bg-active' : ''}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <input
              placeholder="Type any emoji"
              maxLength={4}
              className="w-28 rounded border border-line bg-paper px-1.5 py-0.5 text-[13px] outline-none"
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && ev.currentTarget.value.trim()) pick(ev.currentTarget.value.trim())
              }}
            />
            <button onClick={() => pick(null)} className="rounded px-2 text-[13px] text-muted hover:bg-hover">
              Remove
            </button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}
