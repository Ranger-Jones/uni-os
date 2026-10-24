import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as courses from '../repo/courses'
import { runTool, tools, WithImages, type ToolCtx } from '../tools'

/** MCP server exposing the same tools as the in-app assistant. */
export function createMcpServer(ctx: ToolCtx): McpServer {
  const server = new McpServer(
    { name: 'unios', version: '0.1.0' },
    {
      instructions:
        'UniOS is the user\'s university organizer: semesters, courses, note pages, lecture files, assignments, calendar and grades (German scale, 1.0 best, 4.0 pass). Look things up with these tools before answering questions about the user\'s studies. Times are local, formatted YYYY-MM-DD or YYYY-MM-DDTHH:MM. To illustrate notes with figures from lecture PDFs, look at pages with view_pdf_page and cut figures into a note with insert_pdf_image.'
    }
  )
  for (const def of tools) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.input as never,
        annotations: { readOnlyHint: !def.mutates, destructiveHint: false, openWorldHint: false }
      },
      (async (args: unknown) => {
        const r = await runTool(ctx, def.name, args)
        if (!r.ok) return { content: [{ type: 'text' as const, text: r.error }], isError: true }
        if (!(r.result instanceof WithImages)) return { content: [{ type: 'text' as const, text: JSON.stringify(r.result ?? null, null, 1) }] }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(r.result.result ?? null, null, 1) }, ...r.result.images.map((img) => ({ type: 'image' as const, mimeType: img.mimeType, data: img.data }))]
        }
      }) as never
    )
  }
  server.registerResource('courses', 'unios://courses', { description: 'All courses as JSON', mimeType: 'application/json' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(courses.list(ctx.db, { includeArchived: true }).map((c) => ({ id: c.id, name: c.name, ects: c.ects, semester_id: c.semesterId }))) }]
  }))
  return server
}
