// Tables that travel between devices, parents before children (the order remote rows are applied in).
export const SYNC_TABLES = [
  'semesters',
  'courses',
  'course_sessions',
  'events',
  'pages',
  'grade_components',
  'assignments',
  'files',
  'decks',
  'cards',
  'chat_threads',
  'chat_messages',
  'course_links',
  'tests',
  'test_questions',
  'test_attempts'
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export const isSyncTable = (t: string): t is SyncTable => (SYNC_TABLES as readonly string[]).includes(t)

/** Triggers that note every local change in sync_outbox — unless remote changes are being applied. */
export function outboxTriggers(table: string): string {
  const guard = `WHEN (SELECT value FROM sync_state WHERE key = 'applying') IS NOT '1'`
  const note = (row: 'new' | 'old', deleted: 0 | 1) =>
    `INSERT INTO sync_outbox (entity, id, deleted, rev) VALUES ('${table}', ${row}.id, ${deleted}, 1) ON CONFLICT (entity, id) DO UPDATE SET deleted = ${deleted}, rev = rev + 1;`
  return `
  CREATE TRIGGER sync_${table}_ins AFTER INSERT ON ${table} ${guard} BEGIN ${note('new', 0)} END;
  CREATE TRIGGER sync_${table}_upd AFTER UPDATE ON ${table} ${guard} BEGIN ${note('new', 0)} END;
  CREATE TRIGGER sync_${table}_del AFTER DELETE ON ${table} ${guard} BEGIN ${note('old', 1)} END;`
}
