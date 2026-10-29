import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { SyncStatus } from '../../../../main/sync/service'
import { api } from '../../lib/api'

/** Sync status, kept live by the main process's sync:state events. */
export function useSyncStatus() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sync', 'status'], queryFn: () => api.sync.status(), staleTime: 60_000 })
  useEffect(() => window.bridge.on('sync:state', (s) => qc.setQueryData(['sync', 'status'], s as SyncStatus)), [qc])
  return q
}

export function syncAgo(iso: string | null): string {
  if (!iso) return 'not synced yet'
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'synced just now'
  if (min < 60) return `synced ${min} min ago`
  const h = Math.round(min / 60)
  return h < 24 ? `synced ${h} h ago` : `synced on ${new Date(iso).toLocaleDateString()}`
}
