import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@core': resolve(import.meta.dirname, 'src/core') } },
  test: { include: ['tests/core/**/*.test.ts', 'tests/mcp/**/*.test.ts'], environment: 'node', pool: 'forks' }
})
