// Debounced saver that never drops the latest value: failures keep it pending and retry.

export interface Autosaver<T> {
  schedule(value: T): void
  /** Save now. Resolves when nothing is pending; rejects if the save failed (value stays pending). */
  flush(): Promise<void>
  hasPending(): boolean
  dispose(): void
}

export function createAutosaver<T>(opts: { delay: number; retryDelay?: number; save: (value: T) => Promise<void>; onError: (err: unknown) => void; onSaved?: () => void }): Autosaver<T> {
  let pending: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | null = null

  const arm = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void flush().catch(() => {}), ms)
  }

  async function flush(): Promise<void> {
    clearTimeout(timer)
    if (inFlight) await inFlight.catch(() => {})
    if (!pending) return
    const current = pending
    pending = null
    inFlight = opts.save(current.value)
    try {
      await inFlight
      opts.onSaved?.()
    } catch (err) {
      pending ??= current // keep the value unless something newer arrived meanwhile
      opts.onError(err)
      arm(opts.retryDelay ?? 3000)
      throw err
    } finally {
      inFlight = null
    }
    if (pending) return flush()
  }

  return {
    schedule(value) {
      pending = { value }
      arm(opts.delay)
    },
    flush,
    hasPending: () => pending !== null,
    dispose: () => clearTimeout(timer)
  }
}
