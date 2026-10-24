import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export type UpdateState = Awaited<ReturnType<typeof api.update.state>>

export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    void api.update.state().then(setState)
    return window.bridge.on('update:state', (s) => setState(s as UpdateState))
  }, [])
  return state
}
