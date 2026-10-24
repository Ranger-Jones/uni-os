import * as courses from '@core/repo/courses'
import * as pages from '@core/repo/pages'
import * as search from '@core/repo/search'
import * as semesters from '@core/repo/semesters'
import * as sessions from '@core/repo/sessions'
import type { Settings } from '@core/settings'
import { storeAsset } from './assets'
import type { AppContext } from './context'

/** Electron-only capabilities the router needs; injected so this file stays importable as a type. */
export interface Host {
  chooseFolder(title: string): Promise<string | null>
  applyTheme(theme: Settings['theme']): void
  appInfo(): { version: string; userDataDir: string; platform: string }
}

type Patch<T> = { id: string; patch: T }

export function createRouter(ctx: AppContext, host: Host) {
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
      remove: ({ id }: { id: string }) => semesters.remove(ctx.db, id)
    },
    courses: {
      list: (opts: { semesterId?: string; includeArchived?: boolean } = {}) => courses.list(ctx.db, opts),
      get: ({ id }: { id: string }) => courses.get(ctx.db, id),
      create: (input: courses.CourseInput) => courses.create(ctx.db, input),
      update: ({ id, patch }: Patch<Parameters<typeof courses.update>[2]>) => courses.update(ctx.db, id, patch),
      remove: ({ id }: { id: string }) => courses.remove(ctx.db, id)
    },
    pages: {
      tree: ({ courseId }: { courseId: string | null }) => pages.tree(ctx.db, { courseId }),
      get: ({ id }: { id: string }) => pages.get(ctx.db, id),
      ancestors: ({ id }: { id: string }) => pages.ancestors(ctx.db, id),
      create: (input: Parameters<typeof pages.create>[1]) => pages.create(ctx.db, input),
      updateContent: ({ id, content }: { id: string; content: unknown[] }) => pages.updateContent(ctx.db, id, content),
      update: ({ id, patch }: Patch<Parameters<typeof pages.update>[2]>) => pages.update(ctx.db, id, patch),
      duplicate: ({ id }: { id: string }) => pages.duplicate(ctx.db, id),
      trash: ({ id }: { id: string }) => pages.trash(ctx.db, id),
      restore: ({ id }: { id: string }) => pages.restore(ctx.db, id),
      purge: ({ id }: { id: string }) => pages.purge(ctx.db, id),
      listTrash: () => pages.listTrash(ctx.db)
    },
    search: {
      query: ({ q, courseId }: { q: string; courseId?: string }) => search.query(ctx.db, q, { courseId, limit: 20 })
    },
    assets: {
      store: ({ name, data }: { name: string; data: Uint8Array }) => storeAsset(ctx, name, data)
    },
    sessions: {
      listAll: () => sessions.listAll(ctx.db),
      listForCourse: ({ courseId }: { courseId: string }) => sessions.listForCourse(ctx.db, courseId),
      replaceForCourse: ({ courseId, rows }: { courseId: string; rows: Omit<sessions.SessionInput, 'courseId'>[] }) =>
        sessions.replaceForCourse(ctx.db, courseId, rows)
    }
  }
}

export type Router = ReturnType<typeof createRouter>
