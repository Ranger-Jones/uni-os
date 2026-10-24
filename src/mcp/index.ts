// UniOS MCP server (stdio). Started by Claude Desktop / Claude Code with the UniOS (Electron) binary and
// ELECTRON_RUN_AS_NODE=1, so it shares the app's native SQLite build. Reads the data folder from the app's settings.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { openDb } from '@core/db/open'
import { createMcpServer } from '@core/mcp/server'
import { dbPathFor, defaultUserDataDir, readSettings } from '@core/settings'

async function main(): Promise<void> {
  const settings = readSettings(join(defaultUserDataDir(), 'settings.json'))
  mkdirSync(join(settings.dataDir, 'files'), { recursive: true })
  const { db, sqlite } = openDb(dbPathFor(settings.dataDir))
  const server = createMcpServer({ db, filesDir: join(settings.dataDir, 'files'), now: () => new Date() })
  await server.connect(new StdioServerTransport())
  const close = () => {
    sqlite.close()
    process.exit(0)
  }
  process.stdin.on('close', close)
  process.on('SIGTERM', close)
}

main().catch((err) => {
  console.error('[unios-mcp]', err)
  process.exit(1)
})
