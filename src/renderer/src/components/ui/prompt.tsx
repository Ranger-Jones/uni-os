import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Input } from './Input'

interface PromptRequest {
  title: string
  initial: string
  confirmLabel: string
  resolve: (v: string | null) => void
}

const usePromptStore = create<{ req: PromptRequest | null; set: (r: PromptRequest | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }))

/** Promise-based text prompt (window.prompt is not available in Electron). */
export function prompt(opts: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => usePromptStore.getState().set({ ...opts, resolve }))
}

export function PromptHost() {
  const { req, set } = usePromptStore()
  const [value, setValue] = useState('')
  useEffect(() => setValue(req?.initial ?? ''), [req])
  const close = (v: string | null) => {
    req?.resolve(v)
    set(null)
  }
  return (
    <Dialog
      open={!!req}
      onOpenChange={(o) => !o && close(null)}
      title={req?.title ?? ''}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!value.trim()} onClick={() => close(value.trim())}>
            {req?.confirmLabel}
          </Button>
        </>
      }
    >
      <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && value.trim() && close(value.trim())} />
    </Dialog>
  )
}
