import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { claudeCodeCommand, claudeDesktopConfigPath, mergeClaudeDesktopConfig, type McpServerEntry } from '@core/mcp/config'

const desktopConfigPath = () => claudeDesktopConfigPath(process.platform, homedir(), process.env)

/** How Claude should start the UniOS MCP server on this machine. */
export function mcpEntry(): McpServerEntry {
  const script = join(app.getAppPath(), 'out', 'main', 'mcp.js')
  const env: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' }
  if (process.env.UNIOS_USER_DATA) env.UNIOS_USER_DATA = process.env.UNIOS_USER_DATA
  return { command: process.execPath, args: [script], env }
}

export function mcpSetupInfo() {
  const entry = mcpEntry()
  const path = desktopConfigPath()
  let installed = false
  try {
    installed = existsSync(path) && JSON.stringify((JSON.parse(readFileSync(path, 'utf8')) as { mcpServers?: { unios?: unknown } }).mcpServers?.unios) === JSON.stringify(entry)
  } catch {
    installed = false
  }
  return {
    desktopConfig: JSON.stringify({ mcpServers: { unios: entry } }, null, 2),
    claudeCode: claudeCodeCommand(entry),
    desktopInstalled: installed,
    packaged: app.isPackaged
  }
}

/** Adds UniOS to Claude Desktop's config (a backup of the previous file is kept next to it). */
export function installIntoClaudeDesktop(): void {
  const path = desktopConfigPath()
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null
  const next = mergeClaudeDesktopConfig(existing, mcpEntry())
  mkdirSync(dirname(path), { recursive: true })
  if (existing !== null) copyFileSync(path, `${path}.unios-backup`)
  writeFileSync(path, next)
}
