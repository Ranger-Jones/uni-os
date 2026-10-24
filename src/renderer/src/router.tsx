import { createHashHistory, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { AppShell } from './components/layout/AppShell'
import { CalendarView } from './features/calendar/CalendarView'
import { ChatView } from './features/chat/ChatView'
import { CourseView, type CourseTab } from './features/courses/CourseView'
import { FlashcardsView } from './features/flashcards/FlashcardsView'
import { GradesView } from './features/grades/GradesView'
import { PageView } from './features/pages/PageView'
import { SettingsView } from './features/settings/SettingsView'
import { TodayView } from './features/today/TodayView'

const root = createRootRoute({ component: AppShell })

const index = createRoute({
  getParentRoute: () => root,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/today' })
  }
})
const today = createRoute({ getParentRoute: () => root, path: '/today', component: TodayView })
const calendar = createRoute({ getParentRoute: () => root, path: '/calendar', component: CalendarView })
const grades = createRoute({ getParentRoute: () => root, path: '/grades', component: GradesView })
const flashcards = createRoute({ getParentRoute: () => root, path: '/flashcards', component: FlashcardsView })
const chat = createRoute({
  getParentRoute: () => root,
  path: '/chat',
  validateSearch: (s: Record<string, unknown>): { thread?: string } => (typeof s.thread === 'string' ? { thread: s.thread } : {}),
  component: ChatView
})
export const courseRoute = createRoute({
  getParentRoute: () => root,
  path: '/courses/$courseId',
  validateSearch: (s: Record<string, unknown>): { tab?: CourseTab } => (typeof s.tab === 'string' ? { tab: s.tab as CourseTab } : {}),
  component: CourseView
})
export const pageRoute = createRoute({ getParentRoute: () => root, path: '/pages/$pageId', component: PageView })
const settings = createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsView })

const routeTree = root.addChildren([index, today, calendar, grades, flashcards, chat, courseRoute, pageRoute, settings])

export const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: false })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
