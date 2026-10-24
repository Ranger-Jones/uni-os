import { afterEach, expect, test, vi } from 'vitest'
import { createAutosaver } from '@core/autosave'

afterEach(() => vi.useRealTimers())

test('debounces and saves only the latest value', async () => {
  vi.useFakeTimers()
  const saved: number[] = []
  const a = createAutosaver<number>({ delay: 500, save: async (v) => void saved.push(v), onError: () => {} })
  a.schedule(1)
  a.schedule(2)
  await vi.advanceTimersByTimeAsync(600)
  expect(saved).toEqual([2])
})

test('a failed save keeps the value pending, reports, and retries', async () => {
  vi.useFakeTimers()
  let fail = true
  const saved: string[] = []
  const errors: unknown[] = []
  const a = createAutosaver<string>({ delay: 100, retryDelay: 1000, save: async (v) => {
    if (fail) throw new Error('SQLITE_BUSY')
    saved.push(v)
  }, onError: (e) => errors.push(e) })
  a.schedule('draft')
  await vi.advanceTimersByTimeAsync(150)
  expect(errors).toHaveLength(1)
  expect(a.hasPending()).toBe(true)
  fail = false
  await vi.advanceTimersByTimeAsync(1100)
  expect(saved).toEqual(['draft'])
  expect(a.hasPending()).toBe(false)
})

test('newer edits made while a save is in flight are not lost', async () => {
  const saved: string[] = []
  const a = createAutosaver<string>({ delay: 10_000, save: (v) => new Promise<void>((r) => setTimeout(() => (saved.push(v), r()), 5)), onError: () => {} })
  a.schedule('a')
  const f = a.flush()
  a.schedule('b') // typed while 'a' is being written
  await f
  expect(saved).toEqual(['a', 'b'])
  expect(a.hasPending()).toBe(false)
  a.dispose()
})

test('flush rejects when saving fails so callers can warn before leaving', async () => {
  const a = createAutosaver<string>({ delay: 1000, save: async () => { throw new Error('gone') }, onError: () => {} })
  a.schedule('x')
  await expect(a.flush()).rejects.toThrow('gone')
  expect(a.hasPending()).toBe(true)
})
