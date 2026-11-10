import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, MessageSquareReply, Plus } from 'lucide-react'
import { contacts as contactsApi, emailsSent as emailsApi, leads as leadsApi, responses as responsesApi } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { FilterSelect, SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { Button } from '../components/ui/Button.jsx'
import { CategoryChip } from '../components/ui/Chips.jsx'
import { DetailList, DetailRow, DetailSection, Drawer } from '../components/ui/Drawer.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { FormDrawer, optionsFrom } from '../components/data/FormDrawer.jsx'
import { formatDateTime, relativeTime } from '../lib/format.js'
import { RESPONSE_CATEGORIES, RESPONSE_CHANNELS, categoryMeta, channelLabel } from '../lib/domain.js'
import { byId, matches, optionsOf } from '../lib/lookup.js'

const TABS = [
  { key: 'unclassified', label: 'Unclassified', match: (r) => r.category === 'unclassified' },
  { key: 'a', label: 'A · Not interested', match: (r) => categoryMeta(r.category).bucket === 'A' },
  { key: 'b', label: 'B · Positive', match: (r) => categoryMeta(r.category).bucket === 'B' },
  { key: 'all', label: 'All', match: () => true },
]

const BLANK = {
  contact_id: '',
  email_sent_id: '',
  channel: 'email_reply',
  subject: '',
  body_text: '',
  category: 'unclassified',
}

export default function Responses() {
  const responses = useAsync(() => responsesApi.list(), [])
  const contacts = useAsync(() => contactsApi.list(), [])
  const emails = useAsync(() => emailsApi.list(), [])
  const contactById = useMemo(() => byId(contacts.data), [contacts.data])
  const emailById = useMemo(() => byId(emails.data), [emails.data])
  const contactName = (id) => contactById[id]?.full_name ?? null

  // Arriving from a lead ("Came from: a positive reply") lands on that tab
  // with that reply open.
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'unclassified'))
  const wanted = params.get('id')
  useEffect(() => {
    if (!wanted || !responses.data) return
    const hit = responses.data.find((r) => r.id === wanted)
    if (hit) setSelected(hit)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, responses.data])

  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const save = useSave()
  const act = useSave()

  const rows = responses.data ?? []
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, rows.filter(t.match).length])), [rows])
  const filtered = useMemo(() => {
    const current = TABS.find((t) => t.key === tab) ?? TABS[3]
    return rows.filter(
      (r) =>
        current.match(r) &&
        (!channel || r.channel === channel) &&
        matches(query, r.subject, r.from_email, r.body_text, contactName(r.contact_id)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, query, channel, contactById])

  const columns = [
    {
      key: 'received_at',
      header: 'Received',
      width: '13%',
      sortValue: (r) => new Date(r.received_at).getTime(),
      render: (r) => <span className="text-ink-2">{relativeTime(r.received_at)}</span>,
    },
    {
      key: 'contact_id',
      header: 'Contact',
      width: '20%',
      sortValue: (r) => contactName(r.contact_id),
      render: (r) => <span className="text-ink">{contactName(r.contact_id) ?? '—'}</span>,
    },
    { key: 'channel', header: 'Channel', width: '12%', render: (r) => <span className="text-ink-2">{channelLabel(r.channel)}</span> },
    {
      key: 'category',
      header: 'Category',
      width: '14%',
      sortValue: (r) => categoryMeta(r.category).label,
      render: (r) => <CategoryChip value={r.category} />,
    },
    { key: 'subject', header: 'Subject', width: '41%', render: (r) => r.subject ?? <span className="text-ink-3">(no subject)</span> },
  ]

  async function onSave(values) {
    const payload = {
      ...values,
      contact_id: values.contact_id || null,
      email_sent_id: values.email_sent_id || null,
    }
    const ok = await save.run(() =>
      editing?.id ? responsesApi.update(editing.id, editPayload(payload)) : responsesApi.create(payload),
    )
    if (ok) {
      setEditing(null)
      setSelected(null)
      responses.reload()
    }
  }

  async function classify(category) {
    const ok = await act.run(async () => {
      const updated = await responsesApi.update(selected.id, { category, classified_by: 'human' })
      setSelected(updated)
    })
    if (ok) responses.reload()
  }

  async function onDelete() {
    const ok = await act.run(() => responsesApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      setSelected(null)
      responses.reload()
    }
  }

  const openForm = (value) => {
    save.clear()
    setEditing(value)
  }

  const linkedEmail = selected?.email_sent_id ? emailById[selected.email_sent_id] : null

  return (
    <Screen>
      <PageHeader
        title="Responses"
        count={responses.loading ? null : rows.length}
        description="Table 2: who wrote back, sorted into A (no) and B (yes)"
        actions={
          <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
            <Plus size={14} />
            Record response
          </Button>
        }
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <Tabs tabs={TABS} counts={counts} value={tab} onChange={setTab} />
          <SearchInput value={query} onChange={setQuery} placeholder="Search subject, body, contact" />
          <FilterSelect value={channel} onChange={setChannel} label="Filter by channel">
            <option value="">Any channel</option>
            {RESPONSE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {channelLabel(c)}
              </option>
            ))}
          </FilterSelect>
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={responses.loading}
          error={responses.error}
          onRetry={responses.reload}
          onRowClick={setSelected}
          activeId={selected?.id}
          initialSort={{ key: 'received_at', dir: 'desc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={MessageSquareReply}
                title="No responses yet"
                body="Replies, website enquiries, calls and WhatsApp messages all land here, then get sorted."
                action={
                  <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
                    Record the first response
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={MessageSquareReply}
                title={tab === 'unclassified' ? 'Everything is sorted' : 'Nothing here'}
                body={tab === 'unclassified' ? 'New replies will wait in this tab until someone decides which bucket they belong in.' : undefined}
                action={
                  <Button
                    onClick={() => {
                      setTab('all')
                      setQuery('')
                      setChannel('')
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
        title={selected?.subject ?? '(no subject)'}
        subtitle={selected ? (contactName(selected.contact_id) ?? '') + ' · ' + channelLabel(selected.channel) : ''}
        footer={
          <>
            <Button variant="dangerGhost" onClick={() => { act.clear(); setDeleting(selected) }}>
              Delete
            </Button>
            <Button variant="primary" onClick={() => openForm({ ...BLANK, ...selected, email_sent_id: selected.email_sent_id ?? '' })}>
              Edit
            </Button>
          </>
        }
      >
        {selected && (
          <>
            <Classifier value={selected.category} busy={act.busy} error={act.error} onPick={classify} />
            {selected.category === 'positive' && <CreatedLead response={selected} />}
            <DetailList>
              <DetailRow label="Received" mono>
                {formatDateTime(selected.received_at)}
              </DetailRow>
              <DetailRow label="From">{selected.from_email}</DetailRow>
              <DetailRow label="In reply to">
                {linkedEmail ? (
                  <span>
                    {linkedEmail.subject} <span className="text-ink-3">· {relativeTime(linkedEmail.sent_at ?? linkedEmail.created_at)}</span>
                  </span>
                ) : selected.email_sent_id ? (
                  <span className="text-ink-3">An email no longer listed</span>
                ) : null}
              </DetailRow>
              <DetailRow label="Classified">
                {selected.classified_at && (
                  <span>
                    {formatDateTime(selected.classified_at)}
                    {selected.classified_by && <span className="text-ink-3"> · by {selected.classified_by}</span>}
                  </span>
                )}
              </DetailRow>
            </DetailList>
            <DetailSection title="Message">
              <pre className="whitespace-pre-wrap px-4 pb-4 font-sans text-sm leading-relaxed text-ink-2">
                {selected.body_text || <span className="text-ink-3">No text recorded.</span>}
              </pre>
            </DetailSection>
          </>
        )}
      </Drawer>

      <FormDrawer
        value={editing}
        fields={formFields(contacts.data ?? [], emails.data ?? [], Boolean(editing?.id))}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={onSave}
        titleNew="Record response"
        titleEdit="Edit response"
        submitNew="Record"
        subtitle={editing?.id ? '' : 'An email reply needs the email it answers; other channels need the contact.'}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={act.busy}
        error={act.error}
        title="Delete this response?"
        body="Only possible if no lead was created from it."
      />
    </Screen>
  )
}

/** The one-click sorter at the top of the drawer. */
function Classifier({ value, busy, error, onPick }) {
  return (
    <div className="border-b border-rule px-4 py-3">
      <div className="mb-2 text-xs text-ink-3">Sort into</div>
      <div className="flex flex-wrap gap-1.5">
        {RESPONSE_CATEGORIES.filter((c) => c !== 'unclassified').map((c) => {
          const meta = categoryMeta(c)
          const active = value === c
          return (
            <button
              key={c}
              type="button"
              disabled={busy || active}
              onClick={() => onPick(c)}
              className={
                'inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-xs transition-colors disabled:cursor-default ' +
                (active ? meta.chip : 'text-ink-2 ring-1 ring-inset ring-rule-strong hover:bg-raised hover:text-ink')
              }
            >
              {meta.bucket && <span className="tnum text-2xs opacity-70">{meta.bucket}</span>}
              {meta.label}
            </button>
          )
        })}
        {value !== 'unclassified' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick('unclassified')}
            className="inline-flex h-7 items-center rounded-control px-2.5 text-xs text-ink-3 hover:text-ink"
          >
            Unsort
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-heat-2" role="alert">{error}</p>}
    </div>
  )
}

/** After a reply is marked Positive the database makes a lead; show it. */
function CreatedLead({ response }) {
  const [lead, setLead] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    leadsApi
      .list({ contact_id: response.contact_id })
      .then((rows) => !cancelled && setLead(rows.find((l) => l.response_id === response.id) ?? null))
      .catch(() => !cancelled && setLead(null))
    return () => {
      cancelled = true
    }
  }, [response.id, response.contact_id, response.category])

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
        <span className="text-ink-3">No lead found for this reply.</span>
      )}
    </div>
  )
}

export function Tabs({ tabs, counts, value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-control bg-ground p-0.5 ring-1 ring-inset ring-rule-strong" role="tablist">
      {tabs.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={'inline-flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-xs transition-colors ' + (active ? 'text-ink' : 'text-ink-3 hover:text-ink')}
            style={active ? { backgroundColor: 'color-mix(in oklab, var(--screen) 22%, transparent)' } : undefined}
          >
            {t.label}
            {counts?.[t.key] != null && <span className="tnum text-2xs opacity-70">{counts[t.key]}</span>}
          </button>
        )
      })}
    </div>
  )
}

const editPayload = ({ channel, subject, body_text, category, from_email }) => ({ channel, subject, body_text, category, from_email })

function formFields(contacts, emails, isEdit) {
  return [
    ...(isEdit
      ? []
      : [
          {
            name: 'contact_id',
            label: 'Contact',
            type: 'select',
            hint: 'Filled from the email if left blank',
            nullable: true,
            options: optionsOf(contacts, (c) => c.full_name + ' · ' + c.email, 'Choose a contact'),
          },
          {
            name: 'email_sent_id',
            label: 'In reply to',
            type: 'select',
            hint: 'Needed for email replies',
            nullable: true,
            options: optionsOf(
              emails,
              (e) => (e.subject ?? '') + ' → ' + e.to_email + ' · ' + relativeTime(e.sent_at ?? e.created_at),
              'Not a reply to an email',
            ),
          },
        ]),
    { name: 'channel', label: 'Channel', type: 'select', span: 1, options: optionsFrom(RESPONSE_CHANNELS, channelLabel) },
    { name: 'category', label: 'Category', type: 'select', span: 1, options: optionsFrom(RESPONSE_CATEGORIES, (c) => categoryMeta(c).label) },
    { name: 'from_email', label: 'From address', type: 'email', nullable: true, placeholder: 'Optional' },
    { name: 'subject', label: 'Subject', nullable: true },
    { name: 'body_text', label: 'Message', type: 'textarea', rows: 6, nullable: true },
  ]
}
