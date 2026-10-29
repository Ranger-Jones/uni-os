import type { SupabaseClient } from '@supabase/supabase-js'
import type { RemoteRow, SyncMeta, SyncRemote } from '@core/sync/remote'

const TABLE = 'unios_sync'
const BUCKET = 'unios-files'
const META = { entity: '_meta', id: 'meta' }

/** The sync store in the user's own Supabase project (see SUPABASE_SETUP_SQL). All payloads arrive encrypted. */
export class SupabaseRemote implements SyncRemote {
  constructor(
    private client: SupabaseClient,
    private userId: string,
    private deviceId: string
  ) {}

  private fail(what: string, error: { message: string } | null): never {
    const msg = error?.message ?? 'unknown error'
    if (/relation .*unios_sync.* does not exist|Could not find the table/i.test(msg)) throw new Error('The UniOS table is missing in your Supabase project. Run the setup SQL from Settings → Sync first.')
    if (/bucket not found/i.test(msg)) throw new Error('The UniOS file bucket is missing in your Supabase project. Run the setup SQL from Settings → Sync first.')
    throw new Error(`Supabase ${what} failed: ${msg}`)
  }

  async pull(after: number, limit: number): Promise<RemoteRow[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('entity,id,payload,deleted,updated_at,device_id,seq')
      .gt('seq', after)
      .neq('entity', META.entity)
      .order('seq', { ascending: true })
      .limit(limit)
    if (error) this.fail('download', error)
    return (data ?? []).map((r) => ({ ...r, seq: Number(r.seq) })) as RemoteRow[]
  }

  async push(rows: Omit<RemoteRow, 'seq'>[]): Promise<void> {
    if (!rows.length) return
    const { error } = await this.client.from(TABLE).upsert(
      rows.map((r) => ({ ...r, user_id: this.userId })),
      { onConflict: 'user_id,entity,id' }
    )
    if (error) this.fail('upload', error)
  }

  async getMeta(): Promise<SyncMeta | null> {
    const { data, error } = await this.client.from(TABLE).select('payload').eq('entity', META.entity).eq('id', META.id).maybeSingle()
    if (error) this.fail('reading the sync settings', error)
    return data?.payload ? (JSON.parse(data.payload) as SyncMeta) : null
  }

  async putMeta(meta: SyncMeta): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .upsert({ ...META, user_id: this.userId, payload: JSON.stringify(meta), deleted: false, updated_at: new Date().toISOString(), device_id: this.deviceId }, { onConflict: 'user_id,entity,id' })
    if (error) this.fail('saving the sync settings', error)
  }

  async putBlob(key: string, data: Uint8Array): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).upload(`${this.userId}/${key}`, data, { upsert: true, contentType: 'application/octet-stream' })
    if (error) this.fail('file upload', error)
  }

  async getBlob(key: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage.from(BUCKET).download(`${this.userId}/${key}`)
    if (error) {
      if (/not.?found|404|400/i.test(`${error.message} ${(error as { status?: number }).status ?? ''}`)) return null
      this.fail('file download', error)
    }
    return data ? new Uint8Array(await data.arrayBuffer()) : null
  }
}
