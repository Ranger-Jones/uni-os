import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { expect, test } from 'vitest'
import { dataVersion, migrate, openDb } from '@core/db/open'
import * as schema from '@core/db/schema'
import { memDb, tmpFile } from '../helpers/db'

const tables = (Object.values(schema) as unknown[]).filter((t): t is SQLiteTable => t instanceof SQLiteTable)

test('migrations create every drizzle column', () => {
  const { sqlite } = memDb()
  expect(tables.length).toBeGreaterThanOrEqual(12)
  for (const t of tables) {
    const cfg = getTableConfig(t)
    const cols = (sqlite.prepare(`PRAGMA table_info(${cfg.name})`).all() as { name: string }[]).map((c) => c.name)
    for (const c of cfg.columns) expect(cols, `${cfg.name}.${c.name}`).toContain(c.name)
  }
})

test('migrate is idempotent', () => {
  const { sqlite } = memDb()
  expect(() => migrate(sqlite)).not.toThrow()
})

test('deleting a semester cascades to courses and their children', () => {
  const { sqlite } = memDb()
  const t = '2026-10-24T00:00:00.000Z'
  sqlite.exec(`
    INSERT INTO semesters (id,name,start_date,end_date,sort_order,created_at,updated_at) VALUES ('s','WS 26/27','2026-10-01','2027-03-31',0,'${t}','${t}');
    INSERT INTO courses (id,semester_id,name,ects,color,grading_mode,archived,created_at,updated_at) VALUES ('c','s','Analysis',5,'blue','graded',0,'${t}','${t}');
    INSERT INTO pages (id,course_id,title,content,content_text,sort_order,created_at,updated_at) VALUES ('p','c','Notes','[]','',0,'${t}','${t}');
    INSERT INTO pages (id,course_id,parent_id,title,content,content_text,sort_order,created_at,updated_at) VALUES ('p2','c','p','Sub','[]','',0,'${t}','${t}');
    INSERT INTO assignments (id,course_id,title,status,priority,created_at,updated_at) VALUES ('a','c','Sheet 1','todo','medium','${t}','${t}');
    INSERT INTO course_sessions (id,course_id,kind,weekday,start_time,end_time,created_at,updated_at) VALUES ('x','c','lecture',1,'10:00','12:00','${t}','${t}');
    INSERT INTO grade_components (id,course_id,name,weight,created_at,updated_at) VALUES ('g','c','Exam',100,'${t}','${t}');
  `)
  sqlite.prepare('DELETE FROM semesters WHERE id = ?').run('s')
  for (const table of ['courses', 'pages', 'assignments', 'course_sessions', 'grade_components']) {
    expect((sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n, table).toBe(0)
  }
})

test('data_version changes when another connection writes', () => {
  const file = tmpFile()
  const a = openDb(file)
  const b = openDb(file)
  const v = dataVersion(a.sqlite)
  b.sqlite
    .prepare(
      "INSERT INTO semesters (id,name,start_date,end_date,sort_order,created_at,updated_at) VALUES ('x','WS','2026-10-01','2027-03-31',0,'t','t')"
    )
    .run()
  expect(dataVersion(a.sqlite)).not.toBe(v)
})

test('full text search table exists', () => {
  const { sqlite } = memDb()
  sqlite.prepare("INSERT INTO search_fts (entity_type, entity_id, course_id, title, body) VALUES ('page','p',NULL,'Hello','Lagrange Multiplikatoren')").run()
  const rows = sqlite.prepare("SELECT entity_id FROM search_fts WHERE search_fts MATCH 'lagrange'").all()
  expect(rows).toHaveLength(1)
})
