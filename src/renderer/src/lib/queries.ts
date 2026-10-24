import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, onDbChanged } from './api'
import { useUi } from './store'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
    mutations: {
      onError: (err) => toast.error(err instanceof Error ? err.message : String(err))
    }
  }
})

onDbChanged(() => void queryClient.invalidateQueries())

/** Mutation that refreshes every query afterwards — the data set is small and local. */
export function useApiMutation<I, O>(fn: (input: I) => Promise<O>, opts: { success?: string } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries()
      if (opts.success) toast.success(opts.success)
    }
  })
}

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() })
export const useAppInfo = () => useQuery({ queryKey: ['app', 'info'], queryFn: () => api.app.info() })
export const useSemesters = () => useQuery({ queryKey: ['semesters'], queryFn: () => api.semesters.list() })
export const useCurrentSemester = () => useQuery({ queryKey: ['semesters', 'current'], queryFn: () => api.semesters.current() })

/** The semester shown in the sidebar: the user's pick if it still exists, otherwise the current one. */
export function useActiveSemester() {
  const picked = useUi((s) => s.semesterId)
  const all = useSemesters()
  const current = useCurrentSemester()
  const semester = all.data?.find((s) => s.id === picked) ?? current.data ?? null
  return { semester, isLoading: all.isLoading || current.isLoading, all: all.data ?? [] }
}

export const useCourses = (opts: { semesterId?: string; includeArchived?: boolean } = {}) =>
  useQuery({ queryKey: ['courses', opts], queryFn: () => api.courses.list(opts) })
export const useCourse = (id: string) => useQuery({ queryKey: ['course', id], queryFn: () => api.courses.get({ id }) })
export const useSessions = (courseId: string) =>
  useQuery({ queryKey: ['sessions', courseId], queryFn: () => api.sessions.listForCourse({ courseId }) })
