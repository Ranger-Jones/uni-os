import { join } from 'node:path'
import { appDataRoot } from '../settings'

export interface McpServerEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

/** Add or replace the "unios" server in a claude_desktop_config.json text, leaving everything else untouched. */
export function mergeClaudeDesktopConfig(existing: string | null, entry: McpServerEntry): string {
  let cfg: Record<string, unknown> = {}
  if (existing?.trim()) {
    try {
      cfg = JSON.parse(existing) as Record<string, unknown>
    } catch {
      throw new Error('The Claude Desktop config file is not valid JSON. Fix or remove it, then try again.')
    }
  }
  const servers = (cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : {}) as Record<string, unknown>
  return JSON.stringify({ ...cfg, mcpServers: { ...servers, unios: entry } }, null, 2)
}

const q = (s: string) => (process.platform === 'win32' ? `"${s.replace(/"/g, '\\"')}"` : `'${s.replace(/'/g, `'\\''`)}'`)

export function claudeCodeCommand(entry: McpServerEntry): string {
  const env = Object.entries(entry.env).map(([k, v]) => `-e ${k}=${q(v)}`).join(' ')
  return `claude mcp add unios --scope user ${env} -- ${[entry.command, ...entry.args].map(q).join(' ')}`
}

/** claude_desktop_config.json location on each OS. */
export const claudeDesktopConfigPath = (platform: NodeJS.Platform, home: string, env: Record<string, string | undefined>): string =>
  join(appDataRoot(platform, home, env), 'Claude', 'claude_desktop_config.json')
