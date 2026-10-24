import { asc, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/open'
import { chatMessages, chatThreads } from '../db/schema'
import { notFound } from '../errors'
import { newId, nowIso } from '../util'

export type ChatThread = typeof chatThreads.$inferSelect
export type ChatMessageRow = typeof chatMessages.$inferSelect
type Role = ChatMessageRow['role']

export function listThreads(db: Db): ChatThread[] {
  return db.select().from(chatThreads).orderBy(desc(chatThreads.updatedAt)).all()
}

export function getThread(db: Db, id: string): ChatThread {
  const row = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get()
  if (!row) throw notFound('Chat')
  return row
}

export function createThread(db: Db, input: { title: string; courseId?: string | null; provider: ChatThread['provider']; model: string }): ChatThread {
  const t = nowIso()
  return db.insert(chatThreads).values({ id: newId(), title: input.title, courseId: input.courseId ?? null, provider: input.provider, model: input.model, createdAt: t, updatedAt: t }).returning().get()
}

export function renameThread(db: Db, id: string, title: string): void {
  db.update(chatThreads).set({ title, updatedAt: nowIso() }).where(eq(chatThreads.id, id)).run()
}

export function removeThread(db: Db, id: string): void {
  db.delete(chatThreads).where(eq(chatThreads.id, id)).run()
}

export function messages(db: Db, threadId: string): ChatMessageRow[] {
  return db.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(asc(chatMessages.createdAt), asc(chatMessages.id)).all()
}

/** Provider-native messages in order, exactly as they were appended. */
export function nativeHistory<M = unknown>(db: Db, threadId: string): M[] {
  return messages(db, threadId).map((m) => JSON.parse(m.content) as M)
}

let seq = 0
/** Append-only: messages are never edited, so replayed history stays byte-identical. */
export function appendMessages(db: Db, threadId: string, msgs: { role: string; [k: string]: unknown }[]): void {
  db.transaction((tx) => {
    for (const m of msgs) {
      const role: Role = m.role === 'assistant' ? 'assistant' : m.role === 'tool' ? 'tool' : 'user'
      // created_at plus a monotonic suffix keeps insertion order stable within one millisecond
      tx.insert(chatMessages).values({ id: `${Date.now().toString(36)}-${(seq++).toString(36).padStart(6, '0')}-${newId().slice(0, 8)}`, threadId, role, content: JSON.stringify(m), createdAt: nowIso() }).run()
    }
    tx.update(chatThreads).set({ updatedAt: nowIso() }).where(eq(chatThreads.id, threadId)).run()
  })
}
