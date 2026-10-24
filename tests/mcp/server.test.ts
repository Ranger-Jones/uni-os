import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { expect, test } from 'vitest'
import { mergeClaudeDesktopConfig } from '@core/mcp/config'
import { createMcpServer } from '@core/mcp/server'
import * as assignments from '@core/repo/assignments'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

async function connect() {
  const { db } = memDb()
  const course = seedCourse(db, 'Analysis I')
  const server = createMcpServer({ db, filesDir: join(mkdtempSync(join(tmpdir(), 'unios-mcp-')), 'files'), now: () => new Date('2026-10-24T12:00:00') })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([server.connect(a), client.connect(b)])
  return { db, client, course }
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text)

test('lists all tools with annotations', async () => {
  const { client } = await connect()
  const { tools } = await client.listTools()
  expect(tools.length).toBeGreaterThanOrEqual(20)
  expect(tools.find((t) => t.name === 'search')?.annotations?.readOnlyHint).toBe(true)
  expect(tools.find((t) => t.name === 'create_assignment')?.annotations?.readOnlyHint).toBe(false)
})

test('read and write tools work end to end', async () => {
  const { client, db, course } = await connect()
  const list = await client.callTool({ name: 'list_courses', arguments: {} })
  expect(JSON.parse(text(list))[0]).toMatchObject({ name: 'Analysis I' })
  const created = await client.callTool({ name: 'create_assignment', arguments: { course_id: course.id, title: 'Blatt 6' } })
  expect(created.isError).toBeFalsy()
  expect(assignments.list(db).map((a) => a.title)).toEqual(['Blatt 6'])
})

test('errors come back as tool errors, not protocol failures', async () => {
  const { client } = await connect()
  const r = await client.callTool({ name: 'get_course', arguments: { course_id: 'nope' } })
  expect(r.isError).toBe(true)
  expect(text(r)).toBe('Course not found')
})

test('mergeClaudeDesktopConfig keeps other servers and settings', () => {
  const entry = { command: '/Applications/UniOS.app/Contents/MacOS/UniOS', args: ['/x/mcp.js'], env: { ELECTRON_RUN_AS_NODE: '1' } }
  const merged = JSON.parse(mergeClaudeDesktopConfig(JSON.stringify({ mcpServers: { other: { command: 'x' } }, theme: 'dark' }), entry))
  expect(merged).toEqual({ mcpServers: { other: { command: 'x' }, unios: entry }, theme: 'dark' })
  expect(JSON.parse(mergeClaudeDesktopConfig(null, entry))).toEqual({ mcpServers: { unios: entry } })
  expect(() => mergeClaudeDesktopConfig('{broken', entry)).toThrow(/not valid JSON/)
})
