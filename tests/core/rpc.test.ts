import { expect, test } from 'vitest'
import { AppError } from '@core/errors'
import { resolveRoute, serializeError } from '@core/rpc'

const router = {
  courses: { list: (i: { a: number }) => i.a + 1 },
  ping: () => 'pong'
}

test('resolves nested and top-level routes', () => {
  expect(resolveRoute(router, 'courses.list')({ a: 1 })).toBe(2)
  expect(resolveRoute(router, 'ping')(undefined)).toBe('pong')
})

test('unknown or non-function paths throw NOT_FOUND', () => {
  expect(() => resolveRoute(router, 'courses.nope')).toThrow(AppError)
  expect(() => resolveRoute(router, 'courses')).toThrow(/unknown route/i)
  expect(() => resolveRoute(router, '__proto__.constructor')).toThrow(/unknown route/i)
  expect(() => resolveRoute(router, 'toString')).toThrow(/unknown route/i)
})

test('serializeError keeps AppError codes and hides internals of other errors', () => {
  expect(serializeError(new AppError('VALIDATION', 'bad'))).toEqual({ code: 'VALIDATION', message: 'bad' })
  expect(serializeError(new Error('boom'))).toEqual({ code: 'INTERNAL', message: 'boom' })
  expect(serializeError('x')).toEqual({ code: 'INTERNAL', message: 'x' })
})
