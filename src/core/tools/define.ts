import { z } from 'zod'
import type { Db } from '../db/open'

export interface ToolCtx {
  db: Db
  /** Absolute path of <dataDir>/files. */
  filesDir: string
  now: () => Date
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string
  description: string
  input: S
  /** Changes data — needs user approval in the in-app chat. */
  mutates: boolean
  run(ctx: ToolCtx, input: z.infer<S>): Promise<unknown> | unknown
}

export const defineTool = <S extends z.ZodType>(t: ToolDef<S>): ToolDef<S> => t

export const id = (what: string) => z.string().min(1).describe(`${what} id`)

export interface ToolImage {
  mimeType: string
  /** base64 */
  data: string
}

/** A tool result plus images for clients that can look at them (MCP). Other callers only get `result`. */
export class WithImages {
  constructor(
    readonly result: unknown,
    readonly images: ToolImage[]
  ) {}
}
