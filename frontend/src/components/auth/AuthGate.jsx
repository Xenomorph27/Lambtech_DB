import { createContext, useContext, useEffect, useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { AUTH_ENABLED, supabase } from '../../lib/supabase.js'
import { API_CONFIGURED, http } from '../../api/client.js'
import { Button } from '../ui/Button.jsx'
import { TextField } from '../ui/Field.jsx'

/**
 * Nothing behind this renders until a staff member is signed in.
 *
 * Off entirely in demo mode (no API or no Supabase configured), so the sample
 * data deployment keeps working without a login.
 *
 * Four screens, in the order a new person meets them:
 *   set password   arrived from an invite or "reset password" email link
 *   sign in        email + password
 *   not staff      a real login whose email is not on the staff list (403)
 *   the app
 *
 * The 403 check is a real request to /me, not a guess from the token: the
 * backend owns the staff list, so it is the only thing that can say yes.
 */

const AuthContext = createContext({ email: null, signOut: null })
export const useAuth = () => useContext(AuthContext)

/** Supabase reports an unreachable server as the browser's bare "Failed to fetch". */
const friendly = (message) =>
  /failed to fetch|networkerror|load failed/i.test(message || '')
    ? 'Cannot reach the sign-in service. Check your internet connection and try again.'
    : message

const linkType = () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return hash.get('type')
}

export function AuthGate({ children }) {
  // No demo mode: without the API and Supabase settings the desk cannot work,
  // and saying so beats a wall of failed requests.
  if (!API_CONFIGURED || !AUTH_ENABLED) return <NotConfigured />
  return <Gate>{children}</Gate>
}

function NotConfigured() {
  return (
    <Panel title="Not configured" subtitle="frontend/.env.local">
      <p className="text-sm text-ink-2">
        Set <code className="tnum">VITE_API_BASE_URL</code>, <code className="tnum">VITE_SUPABASE_URL</code> and{' '}
        <code className="tnum">VITE_SUPABASE_ANON_KEY</code>, then reload. See <code>.env.example</code>.
      </p>
    </Panel>
  )
}

function Gate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [needsPassword, setNeedsPassword] = useState(() => ['invite', 'recovery'].includes(linkType()))
  const [staff, setStaff] = useState({ state: 'unknown', message: null })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
      setSession(next ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Ask the backend whether this login is staff, once per session.
  const token = session?.access_token
  useEffect(() => {
    if (!token || needsPassword) return
    let cancelled = false
    setStaff({ state: 'checking', message: null })
    http('/me')
      .then(() => !cancelled && setStaff({ state: 'yes', message: null }))
      .catch((err) => {
        if (cancelled) return
        if (err.status === 403) setStaff({ state: 'no', message: err.message })
        else setStaff({ state: 'error', message: err.message })
      })
    return () => {
      cancelled = true
    }
    // Only re-check when the user changes, not on every silent token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, needsPassword])

  const signOut = () => supabase.auth.signOut()

  if (session === undefined) return <Splash label="Loading" />
  if (needsPassword && session) {
    return <SetPassword onDone={() => { history.replaceState(null, '', window.location.pathname); setNeedsPassword(false) }} />
  }
  if (!session) return <SignIn />
  if (staff.state === 'checking' || staff.state === 'unknown') return <Splash label="Checking access" />
  if (staff.state === 'no') {
    return (
      <Panel title="No access yet" subtitle={session.user.email}>
        <p className="text-sm text-ink-2">{staff.message}</p>
        <Button variant="secondary" size="lg" className="w-full" onClick={signOut}>
          <LogOut size={15} /> Sign out
        </Button>
      </Panel>
    )
  }
  if (staff.state === 'error') {
    return (
      <Panel title="Cannot reach the desk" subtitle={session.user.email}>
        <p className="text-sm text-ink-2">{staff.message}</p>
        <div className="flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" onClick={() => window.location.reload()}>
            Try again
          </Button>
          <Button variant="secondary" size="lg" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </Panel>
    )
  }

  return (
    <AuthContext.Provider value={{ email: session.user.email, signOut }}>{children}</AuthContext.Provider>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ground px-4 py-10">
      <div className="w-full max-w-[360px] rounded-[10px] bg-panel p-6 ring-1 ring-rule">
        <div className="mb-5 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-[5px] bg-accent text-sm font-semibold text-accent-ink"
          >
            L
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink">LambTech Desk</div>
            <div className="truncate text-xs text-ink-3">lambtech.in</div>
          </div>
        </div>
        <h1 className="text-base font-medium text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</p>}
        <div className="mt-5 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  )
}

function Splash({ label }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ground text-xs text-ink-3" role="status">
      {label}…
    </div>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.message === 'Invalid login credentials' ? 'That email and password do not match.' : friendly(err.message))
  }

  async function forgot() {
    if (!email.trim()) {
      setError('Enter your email first, then choose "Forgot password".')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setBusy(false)
    if (err) setError(friendly(err.message))
    else setNotice('If that email belongs to a staff account, a reset link is on its way.')
  }

  return (
    <Panel title="Sign in" subtitle="Staff only">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <TextField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-xs text-heat-2" role="alert">{error}</p>}
        {notice && <p className="text-xs text-ink-2" role="status">{notice}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <button type="button" onClick={forgot} disabled={busy} className="self-start text-xs text-ink-3 hover:text-ink">
          Forgot password?
        </button>
      </form>
    </Panel>
  )
}

function SetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (password.length < 10) return setError('Use at least 10 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) setError(friendly(err.message))
    else onDone()
  }

  return (
    <Panel title="Choose your password" subtitle="You will use it to sign in from now on">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <TextField
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          id="confirm-password"
          label="Repeat it"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <p className="text-xs text-heat-2" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          <KeyRound size={15} /> {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </Panel>
  )
}
