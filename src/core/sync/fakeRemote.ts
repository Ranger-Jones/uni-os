import type { RemoteRow, SyncMeta, SyncRemote } from './remote'

/** In-memory stand-in for the Supabase project (tests and offline development). */
export class FakeRemote implements SyncRemote {
  rows: RemoteRow[] = []
  blobs = new Map<string, Uint8Array>()
  meta: SyncMeta | null = null
  private seq = 0

  async pull(after: number, limit: number): Promise<RemoteRow[]> {
    return this.rows
      .filter((r) => r.seq > after)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map((r) => ({ ...r }))
  }

  async push(rows: Omit<RemoteRow, 'seq'>[]): Promise<void> {
    for (const r of rows) {
      this.rows = this.rows.filter((x) => !(x.entity === r.entity && x.id === r.id))
      this.rows.push({ ...r, seq: ++this.seq })
    }
  }

  async getMeta() {
    return this.meta
  }

  async putMeta(meta: SyncMeta) {
    this.meta = meta
  }

  async putBlob(key: string, data: Uint8Array) {
    this.blobs.set(key, data)
  }

  async getBlob(key: string) {
    return this.blobs.get(key) ?? null
  }
}
