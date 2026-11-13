import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Inbox } from 'lucide-react'
import { companies as companiesApi, confirmEnquiry, enquiries as enquiriesApi, leads as leadsApi } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { Button } from '../components/ui/Button.jsx'
import { EnquiryStatus } from '../components/ui/Chips.jsx'
import { DetailList, DetailRow, DetailSection, Drawer } from '../components/ui/Drawer.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { TextArea } from '../components/ui/Field.jsx'
import { FormDrawer, optionsFrom } from '../components/data/FormDrawer.jsx'
import { formatDateTime, relativeTime } from '../lib/format.js'
import { PRIORITIES, enquiryStatusMeta, priorityMeta } from '../lib/domain.js'
import { matches, optionsOf } from '../lib/lookup.js'
import { Tabs } from './Responses.jsx'

const TABS = [
  { key: 'new', label: 'New', match: (e) => e.status === 'new' },
  { key: 'contacted', label: 'Contacted', match: (e) => e.status === 'contacted' },
  { key: 'confirmed', label: 'Confirmed', match: (e) => e.status === 'confirmed' },
  { key: 'closed', label: 'Closed', match: (e) => e.status === 'rejected' || e.status === 'spam' },
  { key: 'all', label: 'All', match: () => true },
]

/** Statuses staff can move an enquiry to by hand. Confirmed is reached only by Confirm. */
const MOVES = ['new', 'contacted', 'rejected', 'spam']

const digitsOf = (phone) => String(phone ?? '').replace(/\D/g, '')

export default function Enquiries() {
  const enquiries = useAsync(() => enquiriesApi.list(), [])
  const companies = useAsync(() => companiesApi.list(), [])
  const [params, setParams] = useSearchParams()

  const [tab, setTab] = useState('new')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [notes, setNotes] = useState('')
  const save = useSave()
  const act = useSave()

  const rows = enquiries.data ?? []

  // Arriving from a lead ("Came from: a website enquiry") opens that enquiry.
  const wanted = params.get('id')
  useEffect(() => {
    if (!wanted || !enquiries.data) return
    const hit = enquiries.data.find((e) => e.id === wanted)
    if (hit) {
      setTab('all')
      setSelected(hit)
    }
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, enquiries.data])

  useEffect(() => {
    setNotes(selected?.notes ?? '')
  }, [selected?.id, selected?.notes])

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, rows.filter(t.match).length])), [rows])
  const filtered = useMemo(() => {
    const current = TABS.find((t) => t.key === tab) ?? TABS[4]
    return rows.filter((e) => current.match(e) && matches(query, e.name, e.email, e.phone, e.topic, e.page))
  }, [rows, tab, query])

  const columns = [
    {
      key: 'created_at',
      header: 'Received',
      width: '12%',
      sortValue: (e) => new Date(e.created_at).getTime(),
      render: (e) => <span className="text-ink-2">{relativeTime(e.created_at)}</span>,
    },
    { key: 'name', header: 'Name / firm', width: '19%', render: (e) => <span className="text-ink">{e.name}</span> },
    { key: 'email', header: 'Email', width: '19%', render: (e) => <span className="text-ink-2">{e.email}</span> },
    { key: 'phone', header: 'Phone', width: '13%', mono: true },
    { key: 'topic', header: 'Clicked', width: '20%', render: (e) => e.topic ?? <span className="text-ink-3">—</span> },
    { key: 'page', header: 'Page', width: '7%', mono: true, render: (e) => <span className="text-ink-3">{e.page ?? '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      width: '10%',
      sortValue: (e) => enquiryStatusMeta(e.status).label,
      render: (e) => <EnquiryStatus value={e.status} />,
    },
  ]

  /** Apply a change to the open enquiry and keep the drawer and the list in step. */
  async function patch(change) {
    const ok = await act.run(async () => {
      const updated = await enquiriesApi.update(selected.id, change)
      setSelected(updated)
    })
    if (ok) enquiries.reload()
  }

  async function onConfirm(values) {
    const id = confirming.enquiryId
    const ok = await save.run(async () => {
      await confirmEnquiry(id, { ...values, company_id: values.company_id || null })
      setSelected(await enquiriesApi.get(id))
    })
    if (ok) {
      setConfirming(null)
      enquiries.reload()
    }
  }

  async function onDelete() {
    const ok = await act.run(() => enquiriesApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      setSelected(null)
      enquiries.reload()
    }
  }

  const openConfirm = () => {
    save.clear()
    setConfirming({
      enquiryId: selected.id,
      full_name: selected.name,
      email: selected.email,
      phone: selected.phone,
      company_id: '',
      job_title: '',
      priority: 'warm',
      description: selected.topic ?? '',
    })
  }

  const confirmed = selected?.status === 'confirmed'

  return (
    <Screen>
      <PageHeader
        title="Enquiries"
        count={enquiries.loading ? null : rows.length}
        description="Everyone who filled in the form on the website"
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <Tabs tabs={TABS} counts={counts} value={tab} onChange={setTab} />
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, email, phone, button" />
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={enquiries.loading}
          error={enquiries.error}
          onRetry={enquiries.reload}
          onRowClick={setSelected}
          activeId={selected?.id}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No enquiries yet"
                body="When someone submits the form on the website, they appear here within seconds."
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title={tab === 'new' ? 'Nothing new to look at' : 'Nothing here'}
                body={tab === 'new' ? 'Every enquiry has been picked up.' : undefined}
                action={
                  <Button
                    onClick={() => {
                      setTab('all')
                      setQuery('')
                    }}
                  >
                    Show all
                  </Button>
                }
              />
            )
          }
        />
      </Panel>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected ? (selected.topic ?? 'Website enquiry') + (selected.page ? ' · ' + selected.page : '') : ''}
        footer={
          <>
            <Button
              variant="dangerGhost"
              onClick={() => {
                act.clear()
                setDeleting(selected)
              }}
            >
              Delete
            </Button>
            {!confirmed && (
              <Button variant="primary" onClick={openConfirm} disabled={selected?.status === 'spam'}>
                Confirm as lead
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <>
            {confirmed ? (
              <EnquiryLead enquiry={selected} busy={act.busy} error={act.error} onReopen={() => patch({ status: 'contacted' })} />
            ) : (
              <Mover value={selected.status} busy={act.busy} error={act.error} onPick={(status) => patch({ status })} />
            )}
            <DetailList>
              <DetailRow label="Status">
                <EnquiryStatus value={selected.status} />
              </DetailRow>
              <DetailRow label="Email">
                <a className="text-accent hover:underline" href={'mailto:' + selected.email}>
                  {selected.email}
                </a>
              </DetailRow>
              <DetailRow label="Phone" mono>
                <a className="text-accent hover:underline" href={'tel:' + selected.phone}>
                  {selected.phone}
                </a>
                <a
                  className="ml-3 text-xs text-ink-3 hover:text-ink"
                  href={'https://wa.me/' + digitsOf(selected.phone)}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </DetailRow>
              <DetailRow label="Clicked">{selected.topic}</DetailRow>
              <DetailRow label="On page" mono>
                {selected.page}
              </DetailRow>
              <DetailRow label="Came via">{selected.meta?.utm_source ?? selected.meta?.referrer}</DetailRow>
              <DetailRow label="Received" mono>
                {formatDateTime(selected.created_at)}
              </DetailRow>
              <DetailRow label="Picked up" mono>
                {selected.handled_at ? formatDateTime(selected.handled_at) : null}
              </DetailRow>
            </DetailList>
            <DetailSection
              title="Notes"
              action={
                <Button size="sm" disabled={act.busy || notes === (selected.notes ?? '')} onClick={() => patch({ notes: notes || null })}>
                  Save notes
                </Button>
              }
            >
              <div className="px-4 pb-4">
                <TextArea
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="What was said, when to call back"
                  aria-label="Notes"
                />
              </div>
            </DetailSection>
          </>
        )}
      </Drawer>

      <FormDrawer
        value={confirming}
        fields={confirmFields(companies.data ?? [])}
        busy={save.busy}
        error={save.error}
        onCancel={() => setConfirming(null)}
        onSave={onConfirm}
        titleNew="Confirm as lead"
        titleEdit="Confirm as lead"
        submitNew="Create lead"
        subtitle="Creates the contact (or reuses one with this email) and the next LT- lead"
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={act.busy}
        error={act.error}
        title={'Delete the enquiry from ' + (deleting?.name ?? 'this person') + '?'}
        body="Use this for junk. An enquiry that became a lead cannot be deleted."
      />
    </Screen>
  )
}

/** One-click status moves at the top of the drawer. */
function Mover({ value, busy, error, onPick }) {
  return (
    <div className="border-b border-rule px-4 py-3">
      <div className="mb-2 text-xs text-ink-3">Move to</div>
      <div className="flex flex-wrap gap-1.5">
        {MOVES.map((status) => {
          const meta = enquiryStatusMeta(status)
          const active = value === status
          return (
            <button
              key={status}
              type="button"
              disabled={busy || active}
              onClick={() => onPick(status)}
              className={
                'inline-flex h-7 items-center rounded-control px-2.5 text-xs transition-colors disabled:cursor-default ' +
                (active
                  ? 'text-ink ring-1 ring-inset ring-rule-strong'
                  : 'text-ink-2 ring-1 ring-inset ring-rule-strong hover:bg-raised hover:text-ink')
              }
              style={active ? { backgroundColor: 'color-mix(in oklab, var(--screen) 22%, transparent)' } : undefined}
            >
              {meta.label}
            </button>
          )
        })}
      </div>
      {error && (
        <p className="mt-2 text-xs text-heat-2" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** A confirmed enquiry shows the lead it became, or offers to reopen if that lead is gone. */
function EnquiryLead({ enquiry, busy, error, onReopen }) {
  const [lead, setLead] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    leadsApi
      .list({ enquiry_id: enquiry.id })
      .then((rows) => !cancelled && setLead(rows[0] ?? null))
      .catch(() => !cancelled && setLead(null))
    return () => {
      cancelled = true
    }
  }, [enquiry.id])

  if (lead === undefined) return null
  return (
    <div className="flex items-center gap-2 border-b border-rule bg-won/8 px-4 py-2.5 text-xs">
      {lead ? (
        <>
          <span className="text-won">Lead {lead.serial_no} created</span>
          <Link to={'/leads?serial=' + lead.serial_no} className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
            Open lead <ArrowRight size={12} />
          </Link>
        </>
      ) : (
        <>
          <span className="text-ink-3">The lead this became has been deleted.</span>
          <Button size="sm" className="ml-auto" disabled={busy} onClick={onReopen}>
            Reopen enquiry
          </Button>
          {error && (
            <span className="text-heat-2" role="alert">
              {error}
            </span>
          )}
        </>
      )}
    </div>
  )
}

function confirmFields(companies) {
  return [
    { name: 'full_name', label: 'Contact name', required: true, hint: 'The person, not the firm' },
    { name: 'email', label: 'Email', type: 'email', required: true, span: 1 },
    { name: 'phone', label: 'Phone / WhatsApp', required: true, span: 1 },
    {
      name: 'company_id',
      label: 'Company',
      type: 'select',
      hint: 'Add the firm under Companies first',
      nullable: true,
      options: optionsOf(companies, (c) => c.name, 'Individual'),
    },
    { name: 'job_title', label: 'Title', span: 1, nullable: true, placeholder: 'Partner' },
    { name: 'priority', label: 'Priority', type: 'select', span: 1, options: optionsFrom(PRIORITIES, (p) => priorityMeta(p).label) },
    { name: 'description', label: 'What they want', type: 'textarea', rows: 3, nullable: true },
  ]
}
