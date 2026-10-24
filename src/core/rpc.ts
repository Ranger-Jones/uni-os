import { AppError } from './errors'

type AnyFn = (input: any) => unknown

/** Promise-returning client shape for a router of plain functions. */
export type Client<R> = {
  [K in keyof R]: R[K] extends (...args: infer A) => infer O ? (...args: A) => Promise<Awaited<O>> : Client<R[K]>
}

export interface SerializedError {
  code: AppError['code']
  message: string
}

export function resolveRoute(router: object, path: string): AnyFn {
  let node: unknown = router
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) {
      throw new AppError('NOT_FOUND', `Unknown route: ${path}`)
    }
    node = (node as Record<string, unknown>)[key]
  }
  if (typeof node !== 'function') throw new AppError('NOT_FOUND', `Unknown route: ${path}`)
  return node as AnyFn
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof AppError) return { code: err.code, message: err.message }
  if (err instanceof Error) return { code: 'INTERNAL', message: err.message }
  return { code: 'INTERNAL', message: String(err) }
}
