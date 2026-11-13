import { Link } from 'react-router-dom'
import { ArrowRight, Flame, Hourglass, Inbox } from 'lucide-react'
import { leads as leadsApi, overviewStats, transactions as transactionsApi } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { StatRow, StatTile } from '../components/data/StatTile.jsx'
import { ErrorState } from '../components/ui/EmptyState.jsx'
import { LeadStatus, PriorityChip, ProgressBar } from '../components/ui/Chips.jsx'
import { formatAmount, formatCompact } from '../lib/format.js'

/** The desk at a glance: the pipeline's size, and what needs a person today. */
export default function Overview() {
  const stats = useAsync(overviewStats, [])
  const hot = useAsync(() => leadsApi.list({ priority: 'hot' }), [])
  const work = useAsync(() => transactionsApi.list(), [])

  const s = stats.data
  const replies = s ? s.responses_unclassified + s.responses_a + s.responses_b : 0
  const replyRate = s && s.emails_sent > 0 ? Math.round((replies / s.emails_sent) * 100) + '%' : '—'

  const openHot = (hot.data ?? []).filter((l) => !['won', 'lost'].includes(l.status)).slice(0, 8)
  const dueSoon = (work.data ?? [])
    .filter((t) => t.days_left != null && t.days_left <= 14 && !['completed', 'cancelled'].includes(t.status))
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 8)

  return (
    <Screen>
      <PageHeader title="Overview" description="Pipeline and work at a glance" />
      <Panel className="overflow-y-auto">
        {stats.error ? (
          <ErrorState error={stats.error} onRetry={stats.reload} />
        ) : (
          <StatRow>
            <StatTile
              label="New enquiries"
              value={s ? s.enquiries_new : '…'}
              sub="from the website"
              accent={s?.enquiries_new ? '#ffb03a' : undefined}
            />
            <StatTile label="Contacts" value={s ? s.contacts : '…'} sub={s ? s.companies + ' companies' : null} />
            <StatTile label="Emails sent" value={s ? s.emails_sent : '…'} sub={s ? s.emails_bounced + ' bounced' : null} />
            <StatTile label="Reply rate" value={s ? replyRate : '…'} sub={s ? replies + ' replies' : null} />
            <StatTile label="Positive replies" value={s ? s.responses_b : '…'} sub={s ? s.responses_a + ' not interested' : null} accent={s?.responses_b ? '#00e093' : undefined} />
            <StatTile label="Open leads" value={s ? s.leads_open : '…'} sub={s ? s.leads_hot + ' hot · ' + s.leads_total + ' ever' : null} />
            <StatTile label="Active work" value={s ? s.transactions_active : '…'} sub={s ? formatCompact(s.amount_total) + ' contracted' : null} />
            <StatTile label="Outstanding" value={s ? formatCompact(s.amount_remaining) : '…'} sub={s ? formatCompact(s.amount_paid) + ' received' : null} accent={s?.amount_remaining > 0 ? '#ffc61a' : undefined} />
            <StatTile label="Overdue" value={s ? s.transactions_overdue : '…'} accent={s?.transactions_overdue ? '#ff2d55' : undefined} />
          </StatRow>
        )}

        <div className="grid gap-px bg-rule md:grid-cols-3">
          <Section icon={Inbox} title="Needs a person" to="/enquiries" linkLabel="Open enquiries">
            <ul className="divide-y divide-rule/60 pb-2">
              <li className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="tnum w-8 text-xl text-ink">{s ? s.enquiries_new : '…'}</span>
                <span className="min-w-0 flex-1 text-ink-2">
                  new website {s?.enquiries_new === 1 ? 'enquiry' : 'enquiries'}
                </span>
                <Link to="/enquiries" className="text-xs text-accent hover:underline">
                  Pick up
                </Link>
              </li>
              <li className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="tnum w-8 text-xl text-ink">{s ? s.responses_unclassified : '…'}</span>
                <span className="min-w-0 flex-1 text-ink-2">
                  {s?.responses_unclassified === 1 ? 'reply' : 'replies'} to sort into A or B
                </span>
                <Link to="/responses" className="text-xs text-accent hover:underline">
                  Sort
                </Link>
              </li>
            </ul>
          </Section>

          <Section icon={Flame} title="Hot leads" to="/leads" linkLabel="All leads">
            <List
              loading={hot.loading}
              rows={openHot}
              empty="No open leads are marked Hot."
              render={(l) => (
                <>
                  <span className="tnum w-16 shrink-0 text-xs text-ink-3">{l.serial_no}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{l.full_name}</span>
                  <span className="hidden truncate text-xs text-ink-3 lg:block">{l.company_name}</span>
                  <LeadStatus value={l.status} />
                  <PriorityChip value={l.priority} compact />
                </>
              )}
            />
          </Section>

          <Section icon={Hourglass} title="Due in the next 14 days" to="/transactions" linkLabel="All work">
            <List
              loading={work.loading}
              rows={dueSoon}
              empty="Nothing is due in the next two weeks."
              render={(t) => (
                <>
                  <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
                  <ProgressBar pct={t.progress_pct} />
                  <span className={'tnum shrink-0 text-xs ' + (t.is_overdue ? 'text-heat-1' : 'text-ink-3')}>
                    {t.is_overdue ? Math.abs(t.days_left) + 'd overdue' : t.days_left === 0 ? 'today' : t.days_left + 'd'}
                  </span>
                  <span className="tnum hidden shrink-0 text-xs text-ink-3 lg:block">{formatAmount(t.amount_remaining)} owed</span>
                </>
              )}
            />
          </Section>
        </div>
      </Panel>
    </Screen>
  )
}

function Section({ icon: Icon, title, to, linkLabel, children }) {
  return (
    <section className="surface-screen flex min-h-[200px] flex-col">
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-1.5">
        <Icon size={14} className="text-ink-3" />
        <h2 className="text-xs font-medium text-ink-2">{title}</h2>
        <Link to={to} className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">
          {linkLabel} <ArrowRight size={12} />
        </Link>
      </header>
      {children}
    </section>
  )
}

function List({ loading, rows, empty, render }) {
  if (loading) return <p className="px-4 py-3 text-xs text-ink-3">Loading…</p>
  if (rows.length === 0) return <p className="px-4 py-3 text-sm text-ink-3">{empty}</p>
  return (
    <ul className="divide-y divide-rule/60 pb-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 px-4 py-1.5 text-sm">
          {render(row)}
        </li>
      ))}
    </ul>
  )
}
