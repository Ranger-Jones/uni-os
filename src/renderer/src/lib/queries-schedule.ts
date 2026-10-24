import { useQuery } from '@tanstack/react-query'
import type { AssignmentFilter } from '@core/repo/assignments'
import { api } from './api'

export const useAssignments = (f: AssignmentFilter = {}) => useQuery({ queryKey: ['assignments', f], queryFn: () => api.assignments.list(f) })
export const useEvents = (range: { from: string; to: string; courseId?: string }) =>
  useQuery({ queryKey: ['events', range], queryFn: () => api.events.list(range) })
export const useOccurrences = (range: { from: string; to: string }) =>
  useQuery({ queryKey: ['occurrences', range], queryFn: () => api.sessions.occurrences(range) })
export const useAllCourses = () => useQuery({ queryKey: ['courses', 'all'], queryFn: () => api.courses.list({ includeArchived: true }) })
