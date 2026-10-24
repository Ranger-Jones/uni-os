import { z } from 'zod'
import { markdownToBlocks } from '../domain/markdown'
import { localDateTime } from '../util'
import * as assignments from '../repo/assignments'
import * as courses from '../repo/courses'
import * as events from '../repo/events'
import * as files from '../repo/files'
import * as grades from '../repo/grades'
import * as pages from '../repo/pages'
import { defineTool, id } from './define'

const grade = z.number().min(1, 'grade must be between 1.0 and 5.0').max(5, 'grade must be between 1.0 and 5.0')

export const writeTools = [
  defineTool({
    name: 'create_page',
    description: 'Create a note page from Markdown, inside a course (course_id) and optionally below another page (parent_id). Link to other pages with [Title](unios://page/<id>).',
    input: z.object({ course_id: z.string().nullable().optional(), parent_id: z.string().optional(), title: z.string().min(1), markdown: z.string() }),
    mutates: true,
    run: async ({ db }, i) => {
      if (i.course_id) courses.get(db, i.course_id)
      const p = pages.create(db, { courseId: i.course_id ?? null, parentId: i.parent_id, title: i.title, content: await markdownToBlocks(i.markdown) })
      return { id: p.id, title: p.title }
    }
  }),
  defineTool({
    name: 'append_to_page',
    description: 'Append Markdown content to the end of an existing note page.',
    input: z.object({ page_id: id('Page'), markdown: z.string().min(1) }),
    mutates: true,
    run: async ({ db }, i) => {
      pages.get(db, i.page_id)
      const added = await markdownToBlocks(i.markdown)
      // Read and write in one synchronous transaction so concurrent edits are not overwritten.
      db.transaction((tx) => {
        const p = pages.get(tx as unknown as typeof db, i.page_id)
        pages.updateContent(tx as unknown as typeof db, p.id, [...(JSON.parse(p.content) as unknown[]), ...added], p.updatedAt)
      })
      return { id: i.page_id, appended: true }
    }
  }),
  defineTool({
    name: 'update_page',
    description: 'Rename a page and/or replace its whole content with new Markdown.',
    input: z.object({ page_id: id('Page'), title: z.string().optional(), markdown: z.string().optional() }),
    mutates: true,
    run: async ({ db }, i) => {
      pages.get(db, i.page_id)
      if (i.title !== undefined) pages.update(db, i.page_id, { title: i.title })
      if (i.markdown !== undefined) pages.updateContent(db, i.page_id, await markdownToBlocks(i.markdown))
      return { id: i.page_id, updated: true }
    }
  }),
  defineTool({
    name: 'create_assignment',
    description: 'Create an assignment for a course. due_at is local time: YYYY-MM-DD or YYYY-MM-DDTHH:MM.',
    input: z.object({
      course_id: id('Course'),
      title: z.string().min(1),
      description: z.string().optional(),
      due_at: localDateTime.optional(),
      priority: z.enum(['low', 'medium', 'high']).optional()
    }),
    mutates: true,
    run: ({ db }, i) => {
      const a = assignments.create(db, { courseId: i.course_id, title: i.title, description: i.description, dueAt: i.due_at, priority: i.priority })
      return { id: a.id, title: a.title, due_at: a.dueAt }
    }
  }),
  defineTool({
    name: 'update_assignment',
    description: 'Change an assignment: status (todo, in_progress, done, submitted), title, description, due date or priority.',
    input: z.object({
      assignment_id: id('Assignment'),
      status: z.enum(assignments.ASSIGNMENT_STATUS).optional(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      due_at: localDateTime.nullable().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional()
    }),
    mutates: true,
    run: ({ db }, i) => {
      const a = assignments.update(db, i.assignment_id, { status: i.status, title: i.title, description: i.description, dueAt: i.due_at, priority: i.priority })
      return { id: a.id, title: a.title, status: a.status, due_at: a.dueAt }
    }
  }),
  defineTool({
    name: 'create_event',
    description: 'Add a calendar event such as an exam or appointment. Times are local: YYYY-MM-DDTHH:MM (or YYYY-MM-DD with all_day).',
    input: z.object({
      title: z.string().min(1),
      kind: z.enum(events.EVENT_KINDS),
      starts_at: localDateTime,
      ends_at: localDateTime.optional(),
      all_day: z.boolean().optional(),
      course_id: z.string().optional(),
      location: z.string().optional()
    }),
    mutates: true,
    run: ({ db }, i) => {
      const e = events.create(db, { title: i.title, kind: i.kind, startsAt: i.starts_at, endsAt: i.ends_at, allDay: i.all_day, courseId: i.course_id, location: i.location })
      return { id: e.id, title: e.title, starts_at: e.startsAt }
    }
  }),
  defineTool({
    name: 'set_component_grade',
    description: 'Record a grade for a course component (e.g. "Klausur"). Updates the component with that name if it exists, otherwise creates it. Use weight in percent; passed for pass/fail parts.',
    input: z.object({ course_id: id('Course'), name: z.string().min(1), grade: grade.nullable().optional(), weight: z.number().min(0).max(100).optional(), passed: z.boolean().optional() }),
    mutates: true,
    run: ({ db }, i) => {
      courses.get(db, i.course_id)
      const existing = grades.listComponents(db, i.course_id).find((c) => c.name.trim().toLowerCase() === i.name.trim().toLowerCase())
      const c = existing
        ? grades.updateComponent(db, existing.id, { grade: i.grade, weight: i.weight, passed: i.passed })
        : grades.createComponent(db, { courseId: i.course_id, name: i.name, weight: i.weight ?? 100, grade: i.grade, passed: i.passed })
      return { id: c.id, name: c.name, weight: c.weight, grade: c.grade, passed: c.passed }
    }
  }),
  defineTool({
    name: 'set_file_tags',
    description: 'Replace the tags of a course file, e.g. ["lecture"] or ["exercise", "solution"]. Prefer the usual tags: lecture, exercise, solution, notes, exam, literature.',
    input: z.object({ file_id: id('File'), tags: z.array(z.string()).max(10) }),
    mutates: true,
    run: ({ db }, i) => {
      const f = files.setTags(db, i.file_id, i.tags)
      return { id: f.id, name: f.name, tags: f.tags }
    }
  })
]
