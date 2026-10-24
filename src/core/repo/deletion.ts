// Deleting things that own files: database rows go first (in one transaction); files are removed only after
// the delete committed, so a failed delete never leaves rows pointing at missing files.
import { rmSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { pageAssetDir } from '../assets'
import type { Db } from '../db/open'
import { courses as coursesTable, pages as pagesTable } from '../db/schema'
import { resolveInside } from '../paths'
import * as courses from './courses'
import * as pages from './pages'
import * as semesters from './semesters'

const rm = (abs: string | null) => abs && rmSync(abs, { recursive: true, force: true })

function pageIdsOfCourses(db: Db, courseIds: string[]): string[] {
  return courseIds.flatMap((id) => db.select({ id: pagesTable.id }).from(pagesTable).where(eq(pagesTable.courseId, id)).all().map((r) => r.id))
}

function cleanup(filesDir: string, courseIds: string[], pageIds: string[]): void {
  for (const id of courseIds) rm(resolveInside(filesDir, id))
  for (const id of pageIds) rm(pageAssetDir(filesDir, id))
}

export function removeCourseWithFiles(db: Db, filesDir: string, courseId: string): void {
  const pageIds = pageIdsOfCourses(db, [courseId])
  courses.remove(db, courseId)
  cleanup(filesDir, [courseId], pageIds)
}

export function removeSemesterWithFiles(db: Db, filesDir: string, semesterId: string): void {
  const courseIds = db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.semesterId, semesterId)).all().map((r) => r.id)
  const pageIds = pageIdsOfCourses(db, courseIds)
  semesters.remove(db, semesterId)
  cleanup(filesDir, courseIds, pageIds)
}

export function purgePageWithFiles(db: Db, filesDir: string, pageId: string): void {
  const ids = db
    .all<{ id: string }>(sql`WITH RECURSIVE sub(id) AS (SELECT ${pageId} UNION ALL SELECT p.id FROM pages p JOIN sub ON p.parent_id = sub.id) SELECT id FROM sub`)
    .map((r) => r.id)
  pages.purge(db, pageId)
  cleanup(filesDir, [], ids)
}
