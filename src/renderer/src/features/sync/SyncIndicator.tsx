import { useNavigate } from '@tanstack/react-router'
import { Cloud, CloudAlert, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { syncAgo, useSyncStatus } from './useSync'

/** One quiet line in the sidebar: when the last sync was, or what went wrong. Click syncs now (or opens settings on errors). */
export function SyncIndicator() {
  const s = useSyncStatus().data
  const navigate = useNavigate()
  if (!s?.enabled) return null
  const label = s.state === 'syncing' ? 'Syncing…' : s.error ? 'Sync problem' : syncAgo(s.lastSyncAt)
  return (
    <button
      onClick={() => (s.error ? void navigate({ to: '/settings' }) : void api.sync.syncNow())}
      title={s.error ?? (s.pending ? `${s.pending} local change(s) waiting — click to sync now` : 'Click to sync now')}
      className={cn('flex h-6 w-full items-center gap-1.5 rounded-md px-2 text-[12px] hover:bg-hover', s.error ? 'text-danger' : 'text-faint hover:text-muted')}
    >
      {s.state === 'syncing' ? <RefreshCw size={12} className="animate-spin" /> : s.error ? <CloudAlert size={12} /> : <Cloud size={12} />}
      <span className="truncate">{label}</span>
    </button>
  )
}
