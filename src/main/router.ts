import * as assignments from '@core/repo/assignments'
import * as cards from '@core/repo/cards'
import * as courses from '@core/repo/courses'
import * as decks from '@core/repo/decks'
import * as events from '@core/repo/events'
import * as files from '@core/repo/files'
import * as grades from '@core/repo/grades'
import * as pages from '@core/repo/pages'
import * as search from '@core/repo/search'
import * as semesters from '@core/repo/semesters'
import * as sessions from '@core/repo/sessions'
import type { Settings } from '@core/settings'
import { storeAsset } from '@core/assets'
import { purgePageWithFiles, removeCourseWithFiles, removeSemesterWithFiles } from '@core/repo/deletion'
import { backupNow, backupStatus } from './backup'
import { fileUrl } from './protocol'
import { isSafeToOpen } from '@core/paths'
import type { AppContext } from './context'
import type { ChatService } from './llm/chat'
import { ANTHROPIC_MODELS } from './llm/anthropic'
import { OPENAI_MODEL_SUGGESTIONS } from './llm/openai'
import { keyStatus, setKey, type Provider } from './secrets'
import { installIntoClaudeDesktop, mcpSetupInfo } from './mcpConfig'
import * as chats from '@core/repo/chats'

/** Electron-only capabilities the router needs; injected so this file stays importable as a type. */
export interface Host {
  chooseFolder(title: string): Promise<string | null>
  chooseFiles(title: string): Promise<string[]>
  openPath(path: string): Promise<void>
  showInFolder(path: string): void
  applyTheme(theme: Settings['theme']): void
  appInfo(): { version: string; userDataDir: string; platform: string }
}

type Patch<T> = { id: string; patch: T }

export function createRouter(ctx: AppContext, host: Host, chat: ChatService) {
  return {
    app: {
      info: () => ({ ...host.appInfo(), dataDir: ctx.dataDir })
    },
    settings: {
      get: () => ctx.settings,
      update: (patch: Partial<Settings>) => {
        const s = ctx.updateSettings(patch)
        if (patch.theme) host.applyTheme(patch.theme)
        return s
      },
      chooseDataDir: async () => {
        const dir = await host.chooseFolder('Choose UniOS data folder')
        return dir ? ctx.updateSettings({ dataDir: dir }) : ctx.settings
      },
      backupStatus: () => backupStatus(ctx),
      backupNow: () => backupNow(ctx),
      chooseBackupDir: async () => {
        const dir = await host.chooseFolder('Choose backup folder')
        return dir ? ctx.updateSettings({ backupDir: dir }) : ctx.settings
      }
    },
    semesters: {
      list: () => semesters.list(ctx.db),
      current: () => semesters.current(ctx.db),
      create: (input: semesters.SemesterInput) => semesters.create(ctx.db, input),
      update: ({ id, patch }: Patch<Parameters<typeof semesters.update>[2]>) => semesters.update(ctx.db, id, patch),
      remove: ({ id }: { id: string }) => removeSemesterWithFiles(ctx.db, ctx.filesDir, id)
    },
    courses: {
      list: (opts: { semesterId?: string; includeArchived?: boolean } = {}) => courses.list(ctx.db, opts),
      get: ({ id }: { id: string }) => courses.get(ctx.db, id),
      create: (input: courses.CourseInput) => courses.create(ctx.db, input),
      update: ({ id, patch }: Patch<Parameters<typeof courses.update>[2]>) => courses.update(ctx.db, id, patch),
      remove: ({ id }: { id: string }) => removeCourseWithFiles(ctx.db, ctx.filesDir, id)
    },
    pages: {
      tree: ({ courseId }: { courseId: string | null }) => pages.tree(ctx.db, { courseId }),
      get: ({ id }: { id: string }) => pages.get(ctx.db, id),
      ancestors: ({ id }: { id: string }) => pages.ancestors(ctx.db, id),
      meta: ({ id }: { id: string }) => {
        try {
          const p = pages.get(ctx.db, id)
          return { id: p.id, title: p.title, icon: p.icon, deleted: !!p.deletedAt }
        } catch {
          return null
        }
      },
      backlinks: ({ id }: { id: string }) => pages.backlinks(ctx.db, id),
      searchTitles: ({ q, exclude }: { q: string; exclude?: string }) => pages.searchTitles(ctx.db, q, { exclude, limit: 8 }),
      create: (input: Parameters<typeof pages.create>[1]) => pages.create(ctx.db, input),
      updateContent: ({ id, content, expectedUpdatedAt }: { id: string; content: unknown[]; expectedUpdatedAt?: string }) => pages.updateContent(ctx.db, id, content, expectedUpdatedAt),
      update: ({ id, patch }: Patch<Parameters<typeof pages.update>[2]>) => pages.update(ctx.db, id, patch),
      duplicate: ({ id }: { id: string }) => pages.duplicate(ctx.db, id),
      trash: ({ id }: { id: string }) => pages.trash(ctx.db, id),
      restore: ({ id }: { id: string }) => pages.restore(ctx.db, id),
      purge: ({ id }: { id: string }) => purgePageWithFiles(ctx.db, ctx.filesDir, id),
      listTrash: () => pages.listTrash(ctx.db)
    },
    search: {
      query: ({ q, courseId }: { q: string; courseId?: string }) => search.query(ctx.db, q, { courseId, limit: 20 })
    },
    files: {
      list: ({ courseId }: { courseId?: string } = {}) => files.list(ctx.db, { courseId }),
      importDialog: async ({ courseId }: { courseId: string }) => {
        const paths = await host.chooseFiles('Add files')
        return paths.length ? files.importFiles(ctx.db, ctx.filesDir, courseId, paths) : []
      },
      rename: ({ id, name }: { id: string; name: string }) => files.rename(ctx.db, id, name),
      setTags: ({ id, tags }: { id: string; tags: string[] }) => files.setTags(ctx.db, id, tags),
      remove: ({ id }: { id: string }) => files.deleteFile(ctx.db, ctx.filesDir, id),
      open: ({ id }: { id: string }) => {
        const abs = files.absolutePath(ctx.db, ctx.filesDir, id)
        if (!isSafeToOpen(files.get(ctx.db, id).storedPath)) return host.showInFolder(abs)
        return host.openPath(abs)
      },
      reveal: ({ id }: { id: string }) => host.showInFolder(files.absolutePath(ctx.db, ctx.filesDir, id)),
      url: ({ id }: { id: string }) => fileUrl(files.get(ctx.db, id).storedPath)
    },
    ai: {
      keyStatus: () => keyStatus(),
      setKey: ({ provider, key }: { provider: Provider; key: string | null }) => {
        setKey(provider, key)
        return keyStatus()
      },
      mcpInfo: () => mcpSetupInfo(),
      installMcp: () => {
        installIntoClaudeDesktop()
        return mcpSetupInfo()
      },
      models: () => ({ anthropic: ANTHROPIC_MODELS, openai: OPENAI_MODEL_SUGGESTIONS }),
      threads: () => chats.listThreads(ctx.db),
      history: ({ threadId }: { threadId: string }) => chat.history(threadId),
      send: (input: Parameters<ChatService['send']>[0]) => chat.send(input),
      approve: ({ runId, callId, approved }: { runId: string; callId: string; approved: boolean }) => chat.approve(runId, callId, approved),
      stop: ({ runId }: { runId: string }) => chat.stop(runId),
      renameThread: ({ id, title }: { id: string; title: string }) => chats.renameThread(ctx.db, id, title),
      removeThread: ({ id }: { id: string }) => chats.removeThread(ctx.db, id)
    },
    cards: {
      decks: ({ courseId }: { courseId?: string | null } = {}) => decks.list(ctx.db, { courseId }, new Date()),
      totalDue: () => decks.totalDue(ctx.db, new Date()),
      createDeck: (input: { courseId?: string | null; name: string }) => decks.create(ctx.db, input),
      renameDeck: ({ id, name }: { id: string; name: string }) => decks.rename(ctx.db, id, name),
      removeDeck: ({ id }: { id: string }) => decks.remove(ctx.db, id),
      list: ({ deckId }: { deckId: string }) => cards.list(ctx.db, deckId),
      due: ({ deckIds }: { deckIds: string[] }) => deckIds.flatMap((d) => cards.listDue(ctx.db, d, new Date(), 200)),
      create: ({ deckId, front, back }: { deckId: string; front: string; back: string }) => cards.create(ctx.db, deckId, { front, back }, new Date()),
      createMany: ({ deckId, items, sourcePageId }: { deckId: string; items: { front: string; back: string }[]; sourcePageId?: string }) =>
        cards.createMany(ctx.db, deckId, items.map((i) => ({ ...i, sourcePageId })), new Date()),
      findOrCreateDeck: ({ courseId, name }: { courseId: string | null; name: string }) => decks.findOrCreate(ctx.db, courseId, name),
      update: ({ id, front, back }: { id: string; front?: string; back?: string }) => cards.update(ctx.db, id, { front, back }),
      remove: ({ id }: { id: string }) => cards.remove(ctx.db, id),
      review: ({ id, rating }: { id: string; rating: 1 | 2 | 3 | 4 }) => cards.review(ctx.db, id, rating, new Date()),
      generate: ({ pageId }: { pageId: string }) => chat.generateCards(pageId)
    },
    assets: {
      store: ({ pageId, name, data }: { pageId: string; name: string; data: Uint8Array }) => fileUrl(storeAsset(ctx.filesDir, pageId, name, data))
    },
    assignments: {
      list: (f: assignments.AssignmentFilter = {}) => assignments.list(ctx.db, f),
      create: (input: assignments.AssignmentInput) => assignments.create(ctx.db, input),
      update: ({ id, patch }: Patch<Parameters<typeof assignments.update>[2]>) => assignments.update(ctx.db, id, patch),
      remove: ({ id }: { id: string }) => assignments.remove(ctx.db, id)
    },
    events: {
      list: (f: { from: string; to: string; courseId?: string }) => events.list(ctx.db, f),
      create: (input: events.EventInput) => events.create(ctx.db, input),
      update: ({ id, patch }: Patch<Parameters<typeof events.update>[2]>) => events.update(ctx.db, id, patch),
      remove: ({ id }: { id: string }) => events.remove(ctx.db, id)
    },
    grades: {
      overview: (opts: { semesterId?: string } = {}) => grades.overview(ctx.db, opts),
      listComponents: ({ courseId }: { courseId: string }) => grades.listComponents(ctx.db, courseId),
      createComponent: (input: grades.ComponentInput) => grades.createComponent(ctx.db, input),
      updateComponent: ({ id, patch }: Patch<Parameters<typeof grades.updateComponent>[2]>) => grades.updateComponent(ctx.db, id, patch),
      removeComponent: ({ id }: { id: string }) => grades.removeComponent(ctx.db, id)
    },
    sessions: {
      occurrences: (range: { from: string; to: string }) => sessions.occurrences(ctx.db, range),
      listAll: () => sessions.listAll(ctx.db),
      listForCourse: ({ courseId }: { courseId: string }) => sessions.listForCourse(ctx.db, courseId),
      replaceForCourse: ({ courseId, rows }: { courseId: string; rows: Omit<sessions.SessionInput, 'courseId'>[] }) =>
        sessions.replaceForCourse(ctx.db, courseId, rows)
    }
  }
}

export type Router = ReturnType<typeof createRouter>
