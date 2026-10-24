import type { Client } from '@core/rpc'
import type { Router } from '../../../main/router'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

function proxy(path: string[]): unknown {
  const call = async (input?: unknown) => {
    const res = await window.bridge.invoke(path.join('.'), input)
    if (!res.ok) throw new ApiError(res.error.code, res.error.message)
    return res.data
  }
  return new Proxy(call, {
    get: (_t, key) => (typeof key === 'string' ? proxy([...path, key]) : undefined)
  })
}

/** Typed client for the main-process router: `await api.courses.list({ semesterId })`. */
export const api = proxy([]) as Client<Router>

export const onDbChanged = (cb: () => void): (() => void) => window.bridge.on('db:changed', cb)
