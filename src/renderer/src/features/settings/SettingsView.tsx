import { FolderOpen } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Input, Select } from '../../components/ui/Input'
import type { ReactNode } from 'react'
import type { Settings } from '@core/settings'
import { Page } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useApiMutation, useAppInfo, useSettings, useTrash } from '../../lib/queries'
import { useUpdateState } from '../update/useUpdate'
import { confirm } from '../../components/ui/confirm'
import { MascotSettings } from '../mascot/MascotSettings'
import { SyncSettings } from '../sync/SyncSettings'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-6 first:border-t-0 first:pt-0">
      <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function SettingsView() {
  const settings = useSettings()
  const info = useAppInfo()
  const update = useApiMutation((patch: Partial<Settings>) => api.settings.update(patch))
  const chooseData = useApiMutation(() => api.settings.chooseDataDir())
  const chooseBackup = useApiMutation(() => api.settings.chooseBackupDir())
  const s = settings.data
  if (!s) return null
  const inICloud = s.dataDir.includes('Mobile Documents')

  return (
    <Page title="Settings">
      <Section title="Storage">
        <Row
          label="Data folder"
          hint={
            <>
              <span className="selectable font-mono text-xs">{s.dataDir}</span>
              {inICloud && (
                <span className="mt-1 block text-warn">
                  This folder syncs with iCloud. A live database in iCloud can get corrupted — choose a local folder and put backups in iCloud instead.
                </span>
              )}
            </>
          }
        >
          <Button size="sm" onClick={() => chooseData.mutate(undefined)}>
            <FolderOpen size={14} /> Change…
          </Button>
        </Row>
        <BackupRow hasDir={!!s.backupDir} />
        <Row
          label="Backup folder"
          hint={
            s.backupDir ? (
              <span className="selectable font-mono text-xs">{s.backupDir}</span>
            ) : (
              'Daily snapshots of your data. iCloud Drive is a good place for them.'
            )
          }
        >
          <Button size="sm" onClick={() => chooseBackup.mutate(undefined)}>
            <FolderOpen size={14} /> {s.backupDir ? 'Change…' : 'Choose…'}
          </Button>
        </Row>
      </Section>

      <Section title="Assistant">
        <AiSettings settings={s} onChange={(patch) => update.mutate(patch)} />
      </Section>

      <Section title="Sync between devices">
        <SyncSettings />
      </Section>

      <Section title="Study buddy">
        <MascotSettings settings={s} onChange={(patch) => update.mutate(patch)} />
      </Section>

      <Section title="Connect Claude">
        <McpSettings />
      </Section>

      <Section title="Appearance">
        <Row label="Theme">
          <div className="flex rounded-md border border-line p-0.5">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => update.mutate({ theme: t })}
                className={cn('rounded px-2.5 py-0.5 text-[13px] capitalize', s.theme === t ? 'bg-active font-medium' : 'text-muted hover:text-ink')}
              >
                {t}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Trash">
        <TrashList />
      </Section>

      <Section title="Updates">
        <UpdateSettings version={info.data?.version} auto={s.checkUpdates} onAuto={(checkUpdates) => update.mutate({ checkUpdates })} />
      </Section>
    </Page>
  )
}

function TrashList() {
  const trash = useTrash()
  const restore = useApiMutation((id: string) => api.pages.restore({ id }), { success: 'Page restored' })
  const purge = useApiMutation((id: string) => api.pages.purge({ id }))
  if (!trash.data?.length) return <p className="text-[13px] text-muted">Pages you delete stay here until you remove them for good.</p>
  return (
    <ul className="flex flex-col">
      {trash.data.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-4 border-b border-line py-1.5 last:border-b-0">
          <span className="truncate text-sm">
            {p.icon} {p.title || 'Untitled'}
            <span className="ml-2 text-[12px] text-faint">deleted {new Date(p.deletedAt!).toLocaleDateString()}</span>
          </span>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => restore.mutate(p.id)}>
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={async () => {
                if (await confirm({ title: 'Delete page permanently?', body: 'This page and its sub-pages cannot be restored afterwards.', confirmLabel: 'Delete permanently', danger: true }))
                  purge.mutate(p.id)
              }}
            >
              Delete
            </Button>
          </span>
        </li>
      ))}
    </ul>
  )
}

function KeyRow({ provider, label, hint, saved }: { provider: 'anthropic' | 'openai'; label: string; hint: string; saved: boolean }) {
  const [value, setValue] = useState('')
  const save = useApiMutation((key: string | null) => api.ai.setKey({ provider, key }), { success: 'API key saved' })
  return (
    <Row label={label} hint={saved ? 'Saved in your macOS keychain.' : hint}>
      {saved ? (
        <Button size="sm" variant="ghost" onClick={() => save.mutate(null)}>
          Remove key
        </Button>
      ) : (
        <>
          <Input type="password" className="w-60" placeholder="Paste API key" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button size="sm" disabled={!value.trim()} onClick={() => save.mutate(value, { onSuccess: () => setValue('') })}>
            Save
          </Button>
        </>
      )}
    </Row>
  )
}

function AiSettings({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const keys = useQuery({ queryKey: ['ai', 'keys'], queryFn: () => api.ai.keyStatus() })
  const models = useQuery({ queryKey: ['ai', 'models'], queryFn: () => api.ai.models() })
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel)
  return (
    <>
      <KeyRow provider="anthropic" label="Anthropic API key" hint="For Claude. Create one at console.anthropic.com." saved={!!keys.data?.anthropic} />
      <KeyRow provider="openai" label="OpenAI API key" hint="For ChatGPT models. Create one at platform.openai.com." saved={!!keys.data?.openai} />
      <Row label="Default for new chats">
        <Select className="w-36" value={settings.defaultProvider} onChange={(e) => onChange({ defaultProvider: e.target.value as Settings['defaultProvider'] })}>
          <option value="anthropic">Claude</option>
          <option value="openai">OpenAI</option>
          <option value="local">Local model</option>
        </Select>
      </Row>
      <Row label="Claude model">
        <Select className="w-48" value={settings.anthropicModel} onChange={(e) => onChange({ anthropicModel: e.target.value })}>
          {models.data?.anthropic.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Row>
      <Row label="OpenAI model" hint="Any chat model name your key can use.">
        <Input className="w-48" list="openai-models" value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} onBlur={() => openaiModel.trim() && openaiModel !== settings.openaiModel && onChange({ openaiModel: openaiModel.trim() })} />
        <datalist id="openai-models">
          {models.data?.openai.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Row>
      <LocalModelSettings settings={settings} onChange={onChange} />
    </>
  )
}

/** A model on this computer (or in the local network) behind an OpenAI-compatible server such as Ollama. */
function LocalModelSettings({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const [url, setUrl] = useState(settings.localBaseUrl)
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'error'; models: string[]; message?: string }>({ state: 'idle', models: [] })
  const test = async (baseUrl = url) => {
    setCheck({ state: 'checking', models: [] })
    try {
      const models = await api.ai.localModels({ baseUrl })
      setCheck({ state: 'ok', models, message: models.length ? undefined : 'Connected, but no models are installed yet (ollama pull …).' })
    } catch (e) {
      setCheck({ state: 'error', models: [], message: e instanceof Error ? e.message : String(e) })
    }
  }
  const saveUrl = () => {
    const v = url.trim()
    if (v && v !== settings.localBaseUrl) onChange({ localBaseUrl: v })
  }
  const options = [...new Set([...(settings.localModel ? [settings.localModel] : []), ...check.models])]
  return (
    <>
      <Row label="Local model server" hint="Ollama (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1) or another OpenAI-compatible server. Runs on your computer, no API key.">
        <Input className="w-60" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={saveUrl} />
        <Button
          size="sm"
          disabled={check.state === 'checking'}
          onClick={() => {
            saveUrl()
            void test()
          }}
        >
          {check.state === 'checking' ? 'Checking…' : 'Check connection'}
        </Button>
      </Row>
      <Row
        label="Local model"
        hint={
          check.state === 'error' ? (
            <span className="text-danger">{check.message}</span>
          ) : check.state === 'ok' ? (
            (check.message ?? `${check.models.length} model${check.models.length === 1 ? '' : 's'} found. Models need tool calling, e.g. qwen3 or gpt-oss.`)
          ) : (
            'Check the connection to list the installed models.'
          )
        }
      >
        <Select className="w-60" value={settings.localModel} onChange={(e) => onChange({ localModel: e.target.value })} disabled={!options.length}>
          <option value="">{options.length ? 'Choose a model' : 'No model chosen'}</option>
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Row>
      <Row label="Let the local model think first" hint="Reasoning models such as qwen3 or gpt-oss can think before they answer. Sometimes better on hard questions, but several times slower.">
        <input type="checkbox" className="h-4 w-4" checked={settings.localThinking} onChange={(e) => onChange({ localThinking: e.target.checked })} />
      </Row>
    </>
  )
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className="selectable max-h-48 overflow-auto rounded-lg bg-hover p-3 pr-16 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-all">{text}</pre>
      <Button
        size="sm"
        variant="secondary"
        className="absolute top-2 right-2"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function McpSettings() {
  const info = useQuery({ queryKey: ['ai', 'mcp'], queryFn: () => api.ai.mcpInfo() })
  const install = useApiMutation(() => api.ai.installMcp(), { success: 'Added to Claude Desktop. Restart Claude Desktop to use UniOS.' })
  if (!info.data) return null
  return (
    <>
      <p className="-mt-2 text-[13px] text-muted">
        Let Claude Desktop or Claude Code read and update your courses, notes, assignments and grades through the UniOS MCP server. It works even when UniOS is closed.
        {!info.data.packaged && ' You are running a development build — install the app first so the path below stays valid.'}
      </p>
      <Row label="Claude Desktop" hint={info.data.desktopInstalled ? 'UniOS is set up. Restart Claude Desktop after changes.' : 'Adds UniOS to claude_desktop_config.json and keeps a backup of the old file.'}>
        <Button size="sm" variant={info.data.desktopInstalled ? 'ghost' : 'primary'} onClick={() => install.mutate(undefined)}>
          {info.data.desktopInstalled ? 'Reinstall' : 'Add to Claude Desktop'}
        </Button>
      </Row>
      <div>
        <div className="mb-1.5 text-sm">Claude Code</div>
        <CopyBlock text={info.data.claudeCode} />
      </div>
      <div>
        <div className="mb-1.5 text-sm">Manual configuration</div>
        <CopyBlock text={info.data.desktopConfig} />
      </div>
    </>
  )
}

function BackupRow({ hasDir }: { hasDir: boolean }) {
  const status = useQuery({ queryKey: ['backup'], queryFn: () => api.settings.backupStatus() })
  const run = useApiMutation(() => api.settings.backupNow())
  const last = status.data?.lastBackupAt
  return (
    <Row
      label="Backups"
      hint={
        status.data?.error ? (
          <span className="text-danger">Last backup failed: {status.data.error}</span>
        ) : last ? (
          `Last backup ${new Date(last).toLocaleString()}. The newest 14 daily snapshots are kept.`
        ) : (
          'No backup yet.'
        )
      }
    >
      <Button size="sm" disabled={!hasDir || run.isPending} onClick={() => run.mutate(undefined)}>
        Back up now
      </Button>
    </Row>
  )
}

function UpdateSettings({ version, auto, onAuto }: { version?: string; auto: boolean; onAuto: (v: boolean) => void }) {
  const state = useUpdateState()
  const text =
    state.status === 'checking'
      ? 'Checking…'
      : state.status === 'up-to-date'
        ? 'You have the latest version.'
        : state.status === 'available' || state.status === 'downloading' || state.status === 'ready'
          ? `Version ${state.release.version} is available — see the notice in the sidebar.`
          : state.status === 'error'
            ? state.message
            : 'New versions are published on GitHub.'
  return (
    <>
      <Row label={`UniOS ${version ?? ''}`} hint={<span className={state.status === 'error' ? 'text-danger' : undefined}>{text}</span>}>
        <Button size="sm" disabled={state.status === 'checking' || state.status === 'downloading'} onClick={() => void api.update.check()}>
          Check for updates
        </Button>
      </Row>
      <Row label="Check automatically" hint="Looks for a new version when UniOS starts and every few hours.">
        <input type="checkbox" checked={auto} onChange={(e) => onAuto(e.target.checked)} aria-label="Check for updates automatically" />
      </Row>
    </>
  )
}
