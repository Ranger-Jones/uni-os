import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  BookOpenCheck,
  ChevronRight,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  PanelLeftClose,
  type LucideIcon,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { courseColor } from '../../lib/colors'
import { useActiveSemester, useApiMutation, useCourses } from '../../lib/queries'
import { shortcut } from '../../lib/platform'
import { useUi } from '../../lib/store'
import { CourseDialog } from '../../features/courses/CourseDialog'
import { SemesterDialog } from '../../features/courses/SemesterDialog'
import { PageTree } from '../../features/pages/PageTree'
import { UpdateCenter } from '../../features/update/UpdateCenter'
import { usePageActions } from '../../features/pages/usePageActions'
import { confirm } from '../ui/confirm'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui/Menu'

const NAV: { to: '/today' | '/calendar' | '/grades' | '/flashcards' | '/chat'; label: string; icon: LucideIcon }[] = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/grades', label: 'Grades', icon: GraduationCap },
  { to: '/flashcards', label: 'Flashcards', icon: BookOpenCheck },
  { to: '/chat', label: 'Assistant', icon: MessageSquare }
]

export function SidebarRow({
  active,
  children,
  className,
  ...rest
}: { active?: boolean; children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'group flex h-7 items-center gap-2 rounded-md px-2 text-[13.5px] text-ink/85 hover:bg-hover',
        active && 'bg-active font-medium text-ink',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const setSemesterId = useUi((s) => s.setSemesterId)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const { semester, all } = useActiveSemester()
  const courses = useCourses({ semesterId: semester?.id })
  const [semesterDialog, setSemesterDialog] = useState<{ open: boolean; editId?: string }>({ open: false })
  const [courseDialog, setCourseDialog] = useState(false)
  const expanded = useUi((s) => s.expanded)
  const toggle = useUi((s) => s.toggleExpanded)
  const pageActions = usePageActions()
  const removeSemester = useApiMutation((id: string) => api.semesters.remove({ id }), { success: 'Semester deleted' })

  return (
    <>
      <div className="drag flex h-11 shrink-0 items-center justify-end px-2">
        <button
          onClick={() => setCollapsed(true)}
          title={`Hide sidebar (${shortcut('\\')})`}
          aria-label="Hide sidebar"
          className="no-drag rounded-md p-1 text-muted opacity-70 hover:bg-hover hover:text-ink hover:opacity-100"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-3">
        <SidebarRow onClick={() => setPaletteOpen(true)} className="text-muted">
          <Search size={15} />
          <span className="flex-1">Search</span>
          <kbd className="text-[11px] text-faint">{shortcut('K')}</kbd>
        </SidebarRow>
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}>
            <SidebarRow active={path.startsWith(to)}>
              <Icon size={15} className="text-muted" />
              {label}
            </SidebarRow>
          </Link>
        ))}

        <div className="mt-5 mb-1 flex items-center justify-between pr-1 pl-2">
          <Menu>
            <MenuTrigger className="flex items-center gap-1 rounded px-1 -ml-1 text-xs font-medium text-muted hover:bg-hover hover:text-ink">
              {semester?.name ?? 'No semester'}
              <ChevronDown size={12} />
            </MenuTrigger>
            <MenuContent>
              {all.length > 0 && <MenuLabel>Switch semester</MenuLabel>}
              {all.map((s) => (
                <MenuItem key={s.id} onSelect={() => setSemesterId(s.id)}>
                  <span className={cn(s.id === semester?.id && 'font-medium')}>{s.name}</span>
                </MenuItem>
              ))}
              {all.length > 0 && <MenuSeparator />}
              <MenuItem icon={<Plus size={14} />} onSelect={() => setSemesterDialog({ open: true })}>
                New semester
              </MenuItem>
              {semester && (
                <>
                  <MenuItem icon={<Pencil size={14} />} onSelect={() => setSemesterDialog({ open: true, editId: semester.id })}>
                    Edit {semester.name}
                  </MenuItem>
                  <MenuItem
                    danger
                    icon={<Trash2 size={14} />}
                    onSelect={async () => {
                      const ok = await confirm({
                        title: `Delete ${semester.name}?`,
                        body: 'All courses of this semester, with their notes, assignments, files and grades, will be deleted.',
                        confirmLabel: 'Delete semester',
                        danger: true
                      })
                      if (ok) {
                        removeSemester.mutate(semester.id)
                        setSemesterId(null)
                      }
                    }}
                  >
                    Delete {semester.name}
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
          {semester && (
            <button
              onClick={() => setCourseDialog(true)}
              className="rounded p-0.5 text-muted opacity-70 hover:bg-hover hover:text-ink hover:opacity-100"
              aria-label="New course"
              title="New course"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        {!semester && (
          <button onClick={() => setSemesterDialog({ open: true })} className="mx-2 rounded-md border border-dashed border-line px-2 py-2 text-left text-[13px] text-muted hover:bg-hover">
            Create your first semester
          </button>
        )}
        {semester && courses.data?.length === 0 && (
          <button onClick={() => setCourseDialog(true)} className="mx-2 rounded-md border border-dashed border-line px-2 py-2 text-left text-[13px] text-muted hover:bg-hover">
            Add a course
          </button>
        )}
        {courses.data?.map((c) => {
          const active = path.startsWith(`/courses/${c.id}`)
          const open = !!expanded[`course:${c.id}`]
          return (
            <div key={c.id}>
              <SidebarRow
                active={active}
                className="relative pl-1"
                onClick={() => void navigate({ to: '/courses/$courseId', params: { courseId: c.id } })}
              >
                <span className="absolute top-1.5 bottom-1.5 left-0.5 w-[3px] rounded-full" style={{ background: courseColor(c.color).solid }} />
                <button
                  className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-active hover:text-ink"
                  aria-label={open ? 'Collapse' : 'Expand'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(`course:${c.id}`)
                  }}
                >
                  <ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />
                </button>
                <span className="w-4 text-center text-[13px]">{c.icon ?? '📘'}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <button
                  className="hidden rounded p-0.5 text-muted group-hover:block hover:bg-active hover:text-ink"
                  aria-label={`New page in ${c.name}`}
                  title="New page"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(`course:${c.id}`, true)
                    void pageActions.create({ courseId: c.id })
                  }}
                >
                  <Plus size={14} />
                </button>
              </SidebarRow>
              {open && <PageTree courseId={c.id} depth={1} emptyHint="No pages yet" />}
            </div>
          )
        })}

        <div className="mt-5 mb-1 flex items-center justify-between pr-1 pl-2">
          <span className="text-xs font-medium text-muted">Pages</span>
          <button
            onClick={() => void pageActions.create({ courseId: null })}
            className="rounded p-0.5 text-muted opacity-70 hover:bg-hover hover:text-ink hover:opacity-100"
            aria-label="New page"
            title="New page"
          >
            <Plus size={14} />
          </button>
        </div>
        <PageTree courseId={null} emptyHint="Pages that belong to no course" />
      </nav>
      <UpdateCenter />
      <div className="border-t border-line px-2 py-2">
        <Link to="/settings">
          <SidebarRow active={path.startsWith('/settings')}>
            <Settings size={15} className="text-muted" />
            Settings
          </SidebarRow>
        </Link>
      </div>

      <SemesterDialog
        open={semesterDialog.open}
        editId={semesterDialog.editId}
        onOpenChange={(open) => setSemesterDialog((d) => ({ ...d, open }))}
        onCreated={(id) => setSemesterId(id)}
      />
      {semester && <CourseDialog open={courseDialog} onOpenChange={setCourseDialog} semesterId={semester.id} />}
    </>
  )
}
