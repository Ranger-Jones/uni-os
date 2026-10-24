// Smoke test: start the built MCP server exactly like Claude Desktop would and call a few tools.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import electronPath from 'electron'

const dir = mkdtempSync(join(tmpdir(), 'unios-mcp-smoke-'))
mkdirSync(join(dir, 'userdata'))
writeFileSync(join(dir, 'userdata', 'settings.json'), JSON.stringify({ dataDir: join(dir, 'data') }))
const transport = new StdioClientTransport({
  command: electronPath,
  args: [resolve('out/main/mcp.js')],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', UNIOS_USER_DATA: join(dir, 'userdata') }
})
const client = new Client({ name: 'smoke', version: '1.0.0' })
await client.connect(transport)
const { tools } = await client.listTools()
console.log('tools:', tools.length)
const r = await client.callTool({ name: 'list_semesters', arguments: {} })
console.log('list_semesters:', r.content[0].text, 'isError:', !!r.isError)
const e = await client.callTool({ name: 'get_course', arguments: { course_id: 'x' } })
console.log('get_course(x):', e.content[0].text, 'isError:', !!e.isError)
await client.close()
