import { Download, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { api } from '../../lib/api'
import { Markdown } from '../chat/Markdown'
import { useUpdateState, type UpdateState } from './useUpdate'

type Release = Extract<UpdateState, { status: 'available' }>['release']

const longDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

function Notes({ release }: { release: Release }) {
  return (
    <div className="max-h-[46vh] overflow-y-auto pr-1">
      {release.notes ? <Markdown text={release.notes} /> : <p className="text-[13px] text-muted">No release notes were published for this version.</p>}
    </div>
  )
}

/** Sidebar notice + dialog for available updates, and the one-time "What's new" after updating. */
export function UpdateCenter() {
  const state = useUpdateState()
  const [open, setOpen] = useState(false)
  const [whatsNew, setWhatsNew] = useState<Release | null>(null)

  useEffect(() => {
    void api.update.whatsNew().then(setWhatsNew)
  }, [])

  const release = 'release' in state ? state.release : undefined
  const showNotice = !!release && ['available', 'downloading', 'ready', 'error'].includes(state.status)

  return (
    <>
      {showNotice && (
        <button onClick={() => setOpen(true)} className="mx-2 mb-2 flex items-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2 text-left hover:border-faint">
          {state.status === 'ready' ? <RefreshCw size={15} className="shrink-0 text-accent" /> : <Download size={15} className="shrink-0 text-accent" />}
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{state.status === 'ready' ? 'Restart to update' : `UniOS ${release!.version} is available`}</span>
            <span className="block text-[12px] text-muted">
              {state.status === 'downloading' ? `Downloading… ${Math.round(state.progress * 100)}%` : state.status === 'error' ? 'Update failed — see details' : 'See what’s new'}
            </span>
          </span>
        </button>
      )}

      {release && (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title={`UniOS ${release.version}`}
          description={`Released ${longDate(release.publishedAt)}`}
          width="max-w-xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Later
              </Button>
              {state.status === 'available' && (
                <Button variant="primary" onClick={() => void api.update.download()}>
                  {state.canInstall ? 'Update' : 'Download'}
                </Button>
              )}
              {state.status === 'error' && (
                <Button variant="primary" onClick={() => void api.update.download()}>
                  Try again
                </Button>
              )}
              {state.status === 'downloading' && (
                <Button variant="primary" disabled>
                  Downloading… {Math.round(state.progress * 100)}%
                </Button>
              )}
              {state.status === 'ready' && (
                <Button variant="primary" onClick={() => void api.update.install()}>
                  Restart &amp; update
                </Button>
              )}
            </>
          }
        >
          {state.status === 'error' && <p className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{state.message}</p>}
          {state.status === 'available' && !state.canInstall && (
            <p className="mb-3 rounded-lg bg-hover px-3 py-2 text-[13px] text-muted">This copy of UniOS can’t update itself here. Download opens the new version in your browser — install it like the first time.</p>
          )}
          {state.status === 'downloading' && (
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-hover">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${state.progress * 100}%` }} />
            </div>
          )}
          {state.status === 'ready' && <p className="mb-3 text-[13px] text-muted">The update is ready. UniOS will close and reopen in a few seconds; your data stays where it is.</p>}
          <Notes release={release} />
        </Dialog>
      )}

      {whatsNew && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              void api.update.dismissWhatsNew()
              setWhatsNew(null)
            }
          }}
          title={`What’s new in UniOS ${whatsNew.version}`}
          width="max-w-xl"
          footer={
            <Button
              variant="primary"
              onClick={() => {
                void api.update.dismissWhatsNew()
                setWhatsNew(null)
              }}
            >
              <Sparkles size={14} /> Got it
            </Button>
          }
        >
          <Notes release={whatsNew} />
        </Dialog>
      )}
    </>
  )
}
