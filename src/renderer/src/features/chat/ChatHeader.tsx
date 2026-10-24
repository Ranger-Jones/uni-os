import { useQuery } from '@tanstack/react-query'
import { Select } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useActiveSemester, useCourses, useSettings } from '../../lib/queries'

export interface NewChatOptions {
  provider: 'anthropic' | 'openai'
  model: string
  courseId: string | null
}

export function useNewChatDefaults(): NewChatOptions | null {
  const s = useSettings().data
  return s ? { provider: s.defaultProvider, model: s.defaultProvider === 'anthropic' ? s.anthropicModel : s.openaiModel, courseId: null } : null
}

/** Pickers shown before the first message of a new chat. */
export function NewChatPickers({ value, onChange }: { value: NewChatOptions; onChange: (v: NewChatOptions) => void }) {
  const models = useQuery({ queryKey: ['ai', 'models'], queryFn: () => api.ai.models() })
  const keys = useQuery({ queryKey: ['ai', 'keys'], queryFn: () => api.ai.keyStatus() })
  const settings = useSettings().data
  const { semester } = useActiveSemester()
  const courses = useCourses({ semesterId: semester?.id })
  const options = [
    ...(keys.data?.anthropic ? (models.data?.anthropic ?? []).map((m) => ({ provider: 'anthropic' as const, id: m.id, label: m.label })) : []),
    ...(keys.data?.openai ? [{ provider: 'openai' as const, id: settings?.openaiModel ?? 'gpt-5', label: `OpenAI ${settings?.openaiModel ?? ''}` }] : [])
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="h-7 w-auto text-[12.5px]" value={`${value.provider}:${value.model}`} onChange={(e) => {
        const [provider, ...rest] = e.target.value.split(':')
        onChange({ ...value, provider: provider as NewChatOptions['provider'], model: rest.join(':') })
      }}>
        {options.map((o) => (
          <option key={`${o.provider}:${o.id}`} value={`${o.provider}:${o.id}`}>
            {o.label}
          </option>
        ))}
        {!options.some((o) => o.provider === value.provider && o.id === value.model) && <option value={`${value.provider}:${value.model}`}>{value.model}</option>}
      </Select>
      <Select className="h-7 w-auto text-[12.5px]" value={value.courseId ?? ''} onChange={(e) => onChange({ ...value, courseId: e.target.value || null })}>
        <option value="">All courses</option>
        {courses.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
