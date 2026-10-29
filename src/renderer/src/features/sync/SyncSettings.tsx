import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { queryClient } from '../../lib/queries'
import { Row } from '../settings/SettingsView'
import { syncAgo, useSyncStatus } from './useSync'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', done ? 'bg-ok text-white' : 'bg-hover text-muted')}>
        {done ? <Check size={12} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-sm font-medium">{title}</p>
        {children}
      </div>
    </div>
  )
}

/** Settings → Sync: connect your own Supabase project, sign in, set the sync password, then it runs by itself. */
export function SyncSettings() {
  const status = useSyncStatus()
  const s = status.data
  const sqlText = useQuery({ queryKey: ['sync', 'sql'], queryFn: () => api.sync.setupSql(), staleTime: Infinity })
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [syncPassword, setSyncPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showSql, setShowSql] = useState(false)
  useEffect(() => {
    if (s?.url && !url) setUrl(s.url)
  }, [s?.url]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (what: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(what)
    try {
      await fn()
      if (success) toast.success(success)
      await queryClient.invalidateQueries({ queryKey: ['sync'] })
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(null)
    }
  }
  if (!s) return null
  const signedIn = !!s.signedInAs

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        Keep UniOS in sync between your computers through your own free Supabase project. Everything is encrypted on this device with your sync password before it is uploaded — Supabase only stores ciphertext. Files up to 50 MB are synced; videos and bigger files stay on their device.
      </p>

      <Step n={1} title="Connect your Supabase project" done={s.configured}>
        <p className="mb-2 text-[12.5px] text-muted">
          Create a project on supabase.com and run the setup SQL once in its SQL editor. Then paste the project URL (https://&lt;project-ref&gt;.supabase.co — a dashboard link works too) and the publishable / anon public key from Project Settings → API Keys. Never paste the secret / service_role key.
        </p>
        <div className="flex flex-col gap-2">
          <Input placeholder="https://abcdefgh.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Input placeholder={s.configured ? 'anon key saved — paste a new one to change it' : 'publishable / anon public key'} value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={!url.trim() || !anonKey.trim() || busy !== null} onClick={() => void run('configure', () => api.sync.configure({ url, anonKey }), 'Supabase project saved').then(() => setAnonKey(''))}>
              Save project
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(sqlText.data ?? '')
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              <Copy size={13} /> {copied ? 'Copied' : 'Copy setup SQL'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSql(!showSql)}>
              {showSql ? 'Hide SQL' : 'Show SQL'}
            </Button>
          </div>
          {showSql && <pre className="selectable max-h-56 overflow-auto rounded-lg bg-hover p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{sqlText.data}</pre>}
        </div>
      </Step>

      <Step n={2} title="Sign in" done={signedIn}>
        {signedIn ? (
          <div className="flex items-center gap-3 text-[13px]">
            <span>
              Signed in as <span className="font-medium">{s.signedInAs}</span>
            </span>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run('signout', () => api.sync.signOut(), 'Signed out')}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className={cn('flex flex-col gap-2', !s.configured && 'pointer-events-none opacity-50')}>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Password for your Supabase account" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabled={!email || !password || busy !== null} onClick={() => void run('signin', () => api.sync.signIn({ email, password }), 'Signed in').then(() => setPassword(''))}>
                Sign in
              </Button>
              <Button
                size="sm"
                disabled={!email || password.length < 6 || busy !== null}
                onClick={() =>
                  void run('signup', async () => {
                    const r = await api.sync.signUp({ email, password })
                    toast.success(r.confirmEmail ? 'Account created — confirm your email address, then sign in.' : 'Account created')
                  })
                }
              >
                Create account
              </Button>
            </div>
            <p className="text-[12px] text-faint">The same account on every device. It is an account in your own project, not at UniOS.</p>
          </div>
        )}
      </Step>

      <Step n={3} title="Sync password" done={s.passwordSet}>
        {s.passwordSet ? (
          <p className="text-[13px] text-muted">Saved in this computer's keychain.</p>
        ) : (
          <div className={cn('flex flex-col gap-2', !signedIn && 'pointer-events-none opacity-50')}>
            <p className="text-[12.5px] text-muted">
              On your first device you choose it; on every further device enter the same one. It encrypts your data and cannot be recovered — without it the synced data cannot be read (your local data is never affected).
            </p>
            <div className="flex gap-2">
              <Input type="password" placeholder="At least 8 characters" value={syncPassword} onChange={(e) => setSyncPassword(e.target.value)} />
              <Button size="sm" variant="primary" disabled={syncPassword.length < 8 || busy !== null} onClick={() => void run('password', () => api.sync.setPassword({ password: syncPassword }), 'Sync is on').then(() => setSyncPassword(''))}>
                {busy === 'password' && <Loader2 size={13} className="animate-spin" />} Start syncing
              </Button>
            </div>
          </div>
        )}
      </Step>

      {!s.keychain && (signedIn || s.passwordSet) && (
        <p className="text-[12.5px] text-muted">
          No system keyring found, so your sign-in and sync key are stored in a file only your user account can read. For keychain protection, install and start gnome-keyring (or KeePassXC with Secret Service), then sign in again.
        </p>
      )}

      {s.passwordSet && signedIn && (
        <>
          <Row label="Sync automatically" hint="At start, a few seconds after changes and every 5 minutes.">
            <input type="checkbox" className="h-4 w-4" checked={s.enabled} onChange={(e) => void run('toggle', () => api.sync.setEnabled({ enabled: e.target.checked }))} />
          </Row>
          <Row
            label="Status"
            hint={
              s.error ? (
                <span className="text-danger">{s.error}</span>
              ) : (
                <>
                  {s.state === 'syncing' ? 'Syncing…' : syncAgo(s.lastSyncAt)}
                  {s.pending > 0 && ` · ${s.pending} local change${s.pending === 1 ? '' : 's'} waiting`}
                  {s.lastResult && ` · last run: ${s.lastResult.pulled} in, ${s.lastResult.pushed} out${s.lastResult.conflicts ? `, ${s.lastResult.conflicts} merged` : ''}`}
                </>
              )
            }
          >
            <Button size="sm" disabled={!s.enabled || s.state === 'syncing'} onClick={() => void run('now', () => api.sync.syncNow())}>
              {s.state === 'syncing' && <Loader2 size={13} className="animate-spin" />} Sync now
            </Button>
          </Row>
        </>
      )}
    </div>
  )
}
