// What the sync engine needs from the cloud. Implemented for Supabase in the main process and in memory for tests.

export interface RemoteRow {
  entity: string
  id: string
  /** Encrypted JSON of the row; null for deletions. */
  payload: string | null
  deleted: boolean
  updated_at: string
  device_id: string
  /** Server-side change counter (pull cursor). */
  seq: number
}

export interface SyncMeta {
  salt: string
  /** Encrypted known value for checking the sync password. */
  check: string
}

export interface SyncRemote {
  /** Changes with seq > after, ascending, at most limit. */
  pull(after: number, limit: number): Promise<RemoteRow[]>
  push(rows: Omit<RemoteRow, 'seq'>[]): Promise<void>
  getMeta(): Promise<SyncMeta | null>
  putMeta(meta: SyncMeta): Promise<void>
  putBlob(key: string, data: Uint8Array): Promise<void>
  /** null when the blob does not exist. */
  getBlob(key: string): Promise<Uint8Array | null>
}
