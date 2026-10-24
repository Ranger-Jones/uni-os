import { FolderOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Settings } from '@core/settings'
import { Page } from '../../components/layout/Page'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useApiMutation, useAppInfo, useSettings, useTrash } from '../../lib/queries'
import { confirm } from '../../components/ui/confirm'

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

      <Section title="About">
        <Row label="UniOS" hint={`Version ${info.data?.version ?? '–'}`}>
          {null}
        </Row>
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
