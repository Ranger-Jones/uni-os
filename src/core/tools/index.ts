import { z } from 'zod'
import { AppError } from '../errors'
import type { ToolCtx, ToolDef } from './define'
import { cardTools } from './cards'
import { pdfTools } from './pdf'
import { readTools } from './read'
import { testTools } from './tests'
import { writeTools } from './write'

export { WithImages } from './define'
export type { ToolCtx, ToolDef, ToolImage } from './define'

export const tools: ToolDef[] = [...readTools, ...writeTools, ...pdfTools, ...cardTools, ...testTools] as ToolDef[]

export const findTool = (name: string): ToolDef | undefined => tools.find((t) => t.name === name)

export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  mutates: boolean
}

/** Provider-neutral tool descriptions (JSON Schema inputs). */
export function toolSpecs(defs: ToolDef[] = tools): ToolSpec[] {
  return defs.map((t) => {
    const { $schema: _s, ...schema } = z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>
    return { name: t.name, description: t.description, inputSchema: schema, mutates: t.mutates }
  })
}

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string }

/** Validate and run a tool. Never throws — errors come back as text the model can read. */
export async function runTool(ctx: ToolCtx, name: string, rawInput: unknown): Promise<ToolResult> {
  const def = findTool(name)
  if (!def) return { ok: false, error: `Unknown tool: ${name}` }
  const parsed = def.input.safeParse(rawInput ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') }
  try {
    return { ok: true, result: await def.run(ctx, parsed.data) }
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
