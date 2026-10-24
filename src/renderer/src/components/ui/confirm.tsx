import { useState } from 'react'
import { create } from 'zustand'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface ConfirmRequest {
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

const useConfirmStore = create<{ req: ConfirmRequest | null; set: (r: ConfirmRequest | null) => void }>((set) => ({
  req: null,
  set: (req) => set({ req })
}))

/** Promise-based confirmation dialog: `if (await confirm({...})) ...` */
export function confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve }))
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore()
  const [busy, setBusy] = useState(false)
  const close = (ok: boolean) => {
    req?.resolve(ok)
    set(null)
    setBusy(false)
  }
  return (
    <Dialog
      open={!!req}
      onOpenChange={(o) => !o && close(false)}
      title={req?.title ?? ''}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={req?.danger ? 'danger' : 'primary'} disabled={busy} onClick={() => (setBusy(true), close(true))} autoFocus>
            {req?.confirmLabel}
          </Button>
        </>
      }
    >
      {req?.body && <p className="text-[13px] text-muted">{req.body}</p>}
    </Dialog>
  )
}
