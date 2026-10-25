import { useEffect, useState } from 'react'
import { ANIMALS, PERSONALITIES, type MascotSettings as Mascot } from '@core/domain/mascot'
import type { Settings } from '@core/settings'
import { Input, Select } from '../../components/ui/Input'
import { cn } from '../../lib/cn'
import { Row } from '../settings/SettingsView'
import { Figure } from './figures'
import './mascot.css'

/** Settings section for the study buddy in the bottom-right corner. */
export function MascotSettings({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const m = settings.mascot
  const set = (patch: Partial<Mascot>) => onChange({ mascot: { ...m, ...patch } })
  const [name, setName] = useState(m.name)
  useEffect(() => setName(m.name), [m.name])
  return (
    <>
      <Row label="Show the study buddy" hint="Sits in the bottom-right corner. Click it to ask about the page you are on.">
        <input type="checkbox" className="h-4 w-4" checked={m.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
      </Row>
      <div className={cn('flex flex-col gap-2', !m.enabled && 'pointer-events-none opacity-50')}>
        <div className="text-sm">Animal</div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {ANIMALS.map((a) => (
            <button
              key={a.id}
              aria-pressed={m.animal === a.id}
              onClick={() => {
                // Keep a name the user typed; swap a default name for the new animal's default.
                const isDefault = ANIMALS.some((x) => x.defaultName === m.name) || !m.name
                set({ animal: a.id, ...(isDefault ? { name: a.defaultName } : {}) })
              }}
              className={cn('mascot flex flex-col items-center rounded-xl border px-1 pt-2 pb-1.5 text-[12px]', m.animal === a.id ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:bg-hover')}
              data-mode={m.animal === a.id && m.dance !== 'off' ? 'dance' : 'idle'}
            >
              <Figure animal={a.id} className="figure h-14 w-12" />
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('flex flex-col gap-4', !m.enabled && 'pointer-events-none opacity-50')}>
        <Row label="Name">
          <Input className="w-48" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== m.name && set({ name: name.trim() })} />
        </Row>
        <Row label="Personality" hint="How it talks to you.">
          <Select className="w-56" value={m.personality} onChange={(e) => set({ personality: e.target.value as Mascot['personality'] })}>
            {PERSONALITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Dancing" hint="It never dances while your system asks to reduce motion.">
          <Select className="w-56" value={m.dance} onChange={(e) => set({ dance: e.target.value as Mascot['dance'] })}>
            <option value="always">All the time</option>
            <option value="sometimes">Now and then</option>
            <option value="off">Don’t dance</option>
          </Select>
        </Row>
        <Row label="Size">
          <Select className="w-56" value={m.size} onChange={(e) => set({ size: e.target.value as Mascot['size'] })}>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </Select>
        </Row>
        <Row label="Model" hint="For example a fast local model for quick questions, and Claude for the big assistant.">
          <Select className="w-56" value={m.provider} onChange={(e) => set({ provider: e.target.value as Mascot['provider'] })}>
            <option value="default">Same as the assistant</option>
            <option value="anthropic">Claude ({settings.anthropicModel})</option>
            <option value="openai">OpenAI ({settings.openaiModel})</option>
            <option value="local" disabled={!settings.localModel}>
              Local {settings.localModel ? `(${settings.localModel})` : '(choose a local model first)'}
            </option>
          </Select>
        </Row>
      </div>
    </>
  )
}
