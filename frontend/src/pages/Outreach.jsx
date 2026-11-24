import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDot, Megaphone, MessageSquareReply, PauseCircle, TrendingUp } from 'lucide-react'
import { outreach } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { StatRow, StatTile } from '../components/data/StatTile.jsx'
import { ErrorState } from '../components/ui/EmptyState.jsx'

const GREEN = '#00e093'
const SENT = '#8093b0'
const TONE = {
  ok: { color: GREEN, icon: CheckCircle2 },
  warn: { color: 'var(--color-heat-2)', icon: PauseCircle },
  danger: { color: 'var(--color-heat-1)', icon: AlertTriangle },
  idle: { color: 'var(--color-ink-2)', icon: CircleDot },
}
const REPLY_TYPES = [
  { key: 'positive', label: 'Positive', note: 'marked by you' },
  { key: 'unclassified', label: 'Not sorted yet', note: 'read and sort these' },
  { key: 'negative', label: 'Not interested', note: 'added to do-not-email' },
  { key: 'unsubscribe', label: 'Unsubscribe', note: 'added to do-not-email' },
  { key: 'auto_reply', label: 'Auto-reply', note: 'out of office; sequence carries on' },
  { key: 'bounced', label: 'Bounced', note: 'address does not exist' },
]
const REFRESH_MS = 60_000

/** How the outreach engine is doing: is it running, why it is or isn't sending, and what it has done. */
export default function Outreach() {
  const dash = useAsync(() => outreach.dashboard(), [])
  const camps = useAsync(() => outreach.campaigns(), [])

  useEffect(() => {
    const timer = setInterval(() => {
      dash.reload()
      camps.reload()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [dash.reload, camps.reload])

  const d = dash.data
  const k = d?.kpis

  return (
    <Screen>
      <PageHeader title="Outreach" description="Is the engine running, why it is or isn't sending, and how the emails are doing (last 30 days)" />
      <Panel className="overflow-y-auto">
        {dash.error && !d ? (
          <ErrorState error={dash.error} onRetry={dash.reload} />
        ) : (
          <>
            <StatusBanner d={d} />
            <StatRow>
              <StatTile
                label="Sent today"
                value={k ? k.sent_today : '…'}
                sub={k ? `${k.cap_left} left of ${k.cap_today} daily cap` : null}
              />
              <StatTile label="Sent, 7 days" value={k ? k.sent_7d : '…'} sub={k ? k.sent_30d + ' in 30 days' : null} />
              <StatTile
                label="Reply rate"
                value={k ? percent(k.people_replied_30d, k.people_emailed_30d) : '…'}
                sub={k ? `${k.people_replied_30d} of ${k.people_emailed_30d} people` : null}
                accent={k?.people_replied_30d ? GREEN : undefined}
              />
              <StatTile
                label="Bounce rate"
                value={k ? percent(k.bounced_30d, k.sent_30d) : '…'}
                sub={k ? `today ${percent(k.bounced_today, k.sent_today)} · auto-pause at ${k.bounce_pause_percent}%` : null}
                accent={bounceAccent(k)}
              />
              <StatTile
                label="Unsubscribes"
                value={d ? d.replies_by_type.unsubscribe : '…'}
                sub={d ? d.replies_by_type.negative + ' not interested' : null}
              />
              <StatTile
                label="Due now"
                value={k ? k.due_now : '…'}
                sub={d ? `${k.queued} queued · ${d.waiting_follow_ups} follow-ups waiting` : null}
              />
              <StatTile
                label="Needs a person"
                value={k ? k.needs_review : '…'}
                sub="stuck or failed sends"
                accent={k?.needs_review ? 'var(--color-heat-1)' : undefined}
              />
            </StatRow>

            <div className="grid gap-px bg-rule md:grid-cols-5">
              <Section icon={TrendingUp} title="Last 14 days" className="md:col-span-3">
                <DailyChart days={d?.daily} />
              </Section>
              <Section icon={MessageSquareReply} title="Replies by type, 30 days" to="/responses" linkLabel="Responses" className="md:col-span-2">
                <ul className="divide-y divide-rule/60 pb-2">
                  {REPLY_TYPES.map((t) => {
                    const n = d?.replies_by_type?.[t.key] ?? 0
                    const loud = t.key === 'unclassified' && n > 0
                    return (
                      <li key={t.key} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="text-ink">{t.label}</span>
                          <span className="ml-2 text-xs text-ink-3">{t.note}</span>
                        </span>
                        <span className={'tnum ' + (loud ? 'text-heat-3' : n ? 'text-ink' : 'text-ink-3')}>{d ? n : '…'}</span>
                      </li>
                    )
                  })}
                </ul>
              </Section>
            </div>

            <div className="grid gap-px border-t border-rule bg-rule md:grid-cols-2">
              <Section icon={CalendarClock} title="Due to send" to="/campaigns" linkLabel="Campaigns">
                <Upcoming rows={d?.upcoming} waiting={d?.waiting_follow_ups} />
              </Section>
              <Section icon={Megaphone} title="Campaigns" to="/campaigns" linkLabel="Open">
                <CampaignTable rows={camps.data} loading={camps.loading && !camps.data} />
              </Section>
            </div>
          </>
        )}
      </Panel>
    </Screen>
  )
}

function StatusBanner({ d }) {
  if (!d) return <div className="border-b border-rule px-4 py-3 text-sm text-ink-3">Loading…</div>
  const tone = TONE[d.status.tone] ?? TONE.idle
  const Icon = tone.icon
  const st = d.state
  return (
    <div className="flex flex-wrap items-start gap-3 border-b border-rule px-4 py-3">
      <Icon size={18} className="mt-0.5 shrink-0" style={{ color: tone.color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-base" style={{ color: tone.color }}>{d.status.headline}</p>
        <p className="text-sm text-ink-2">{d.status.detail}</p>
      </div>
      <div className="text-right text-xs text-ink-3">
        <p>Last run {st.last_cycle_at ? ago(st.last_cycle_at) : 'never'}{st.engine_version ? ` · engine ${st.engine_version}` : ''}</p>
        <p className={st.inbox_status === 'error' ? 'text-heat-1' : ''}>
          Inbox check {st.inbox_status}{st.last_inbox_check_at ? `, ${ago(st.last_inbox_check_at)}` : ''}
        </p>
        <Link to="/mailboxes" className="inline-flex items-center gap-1 text-accent hover:underline">
          Pause and caps <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  )
}

function DailyChart({ days }) {
  if (!days) return <p className="px-4 py-3 text-xs text-ink-3">Loading…</p>
  const max = Math.max(1, ...days.map((x) => x.sent), ...days.map((x) => x.replies))
  const total = days.reduce((a, x) => a + x.sent, 0)
  return (
    <div className="px-4 pb-3">
      <div className="mb-2 flex gap-4 text-xs text-ink-3">
        <Legend color={SENT} label="Sent" />
        <Legend color={GREEN} label="Replies (people, not auto-replies)" />
        {total === 0 && <span className="ml-auto">Nothing sent in the last 14 days</span>}
      </div>
      <div className="flex h-36 items-end gap-1 border-b border-rule" role="img" aria-label={`Emails sent and replies per day for the last 14 days; ${total} sent in total`}>
        {days.map((x) => (
          <div key={x.day} className="flex h-full flex-1 items-end justify-center gap-0.5" title={`${dayLabel(x.day)}: ${x.sent} sent, ${x.replies} replies`}>
            <Bar value={x.sent} max={max} color={SENT} />
            <Bar value={x.replies} max={max} color={GREEN} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {days.map((x) => (
          <span key={x.day} className={'tnum flex-1 text-center text-[11px] ' + (isWeekend(x.day) ? 'text-ink-3/60' : 'text-ink-3')}>
            {weekdayLetter(x.day)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Bar({ value, max, color }) {
  const pct = value ? Math.max(3, (value / max) * 100) : 0
  return <div className="w-full max-w-3 rounded-t-sm" style={{ height: pct + '%', backgroundColor: color }} />
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} /> {label}
    </span>
  )
}

function Upcoming({ rows, waiting }) {
  if (!rows) return <p className="px-4 py-3 text-xs text-ink-3">Loading…</p>
  return (
    <div className="pb-2">
      {rows.length === 0 ? (
        <p className="px-4 py-2 text-sm text-ink-3">Nothing queued. Queue a campaign's drafts to start sending.</p>
      ) : (
        <ul className="divide-y divide-rule/60">
          {rows.map((u) => (
            <li key={u.day + u.campaign} className="flex items-center gap-3 px-4 py-1.5 text-sm">
              <span className="w-28 shrink-0 text-ink-2">{dueLabel(u.day)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{u.campaign}</span>
              <span className="tnum shrink-0 text-xs text-ink-3">
                {u.emails} {u.emails === 1 ? 'email' : 'emails'}{u.follow_ups ? ` · ${u.follow_ups} follow-ups` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 pt-2 text-xs text-ink-3">
        Sends only on weekdays 10:00–17:00 India time, within each mailbox's daily cap, so a busy day spills into the next.
        {waiting ? ` ${waiting} follow-ups get a date once the email before them goes out.` : ''}
      </p>
    </div>
  )
}

function CampaignTable({ rows, loading }) {
  if (loading) return <p className="px-4 py-3 text-xs text-ink-3">Loading…</p>
  const list = (rows ?? []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8)
  if (list.length === 0) return <p className="px-4 py-2 text-sm text-ink-3">No campaigns yet.</p>
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-xs text-ink-3">
          <th className="w-[46%] px-4 py-1 text-left font-normal">Campaign</th>
          <th className="px-2 py-1 text-right font-normal">People</th>
          <th className="px-2 py-1 text-right font-normal">Sent</th>
          <th className="px-2 py-1 text-right font-normal">Replied</th>
          <th className="px-4 py-1 text-right font-normal">Problems</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule/60">
        {list.map((c) => (
          <tr key={c.id}>
            <td className="truncate px-4 py-1.5 text-ink">{c.name}</td>
            <td className="tnum px-2 py-1.5 text-right text-ink-2">{c.recipients}</td>
            <td className="tnum px-2 py-1.5 text-right text-ink-2">{c.sent}</td>
            <td className="tnum px-2 py-1.5 text-right text-ink-2">{c.replied}</td>
            <td className={'tnum px-4 py-1.5 text-right ' + (c.problems ? 'text-heat-1' : 'text-ink-3')}>{c.problems}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Section({ icon: Icon, title, to, linkLabel, className = '', children }) {
  return (
    <section className={'surface-screen flex min-h-[180px] flex-col ' + className}>
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-1.5">
        <Icon size={14} className="text-ink-3" />
        <h2 className="text-xs font-medium text-ink-2">{title}</h2>
        {to && (
          <Link to={to} className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">
            {linkLabel} <ArrowRight size={12} />
          </Link>
        )}
      </header>
      {children}
    </section>
  )
}

// --- small helpers --------------------------------------------------------------------------

function percent(part, whole) {
  if (!whole) return '—'
  const p = (part / whole) * 100
  return (p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)) + '%'
}

function bounceAccent(k) {
  if (!k || !k.sent_30d) return undefined
  const p = (k.bounced_30d / k.sent_30d) * 100
  if (p >= k.bounce_pause_percent) return 'var(--color-heat-1)'
  if (p >= k.bounce_pause_percent / 2) return 'var(--color-heat-3)'
  return undefined
}

function ago(ts) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + ' min ago'
  const hours = Math.floor(mins / 60)
  if (hours < 48) return hours + ' h ago'
  return Math.floor(hours / 24) + ' days ago'
}

const asDay = (day) => new Date(day + 'T00:00:00')
const isWeekend = (day) => [0, 6].includes(asDay(day).getDay())
const weekdayLetter = (day) => asDay(day).toLocaleDateString('en-IN', { weekday: 'narrow' })
const dayLabel = (day) => asDay(day).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })

function dueLabel(day) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((asDay(day) - today) / 86400000)
  if (diff <= 0) return 'Now'
  if (diff === 1) return 'Tomorrow'
  return dayLabel(day)
}
