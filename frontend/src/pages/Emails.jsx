import { useMemo, useState } from 'react'
import { MailWarning, Plus, Send } from 'lucide-react'
import { contacts as contactsApi, emailsSent as emailsApi } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { FilterSelect, SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { Button } from '../components/ui/Button.jsx'
import { EmailStatus } from '../components/ui/Chips.jsx'
import { DetailList, DetailRow, DetailSection, Drawer } from '../components/ui/Drawer.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { FormDrawer, optionsFrom } from '../components/data/FormDrawer.jsx'
import { formatDateTime, relativeTime } from '../lib/format.js'
import { EMAIL_KINDS, EMAIL_STATUSES, emailKindLabel, emailStatusMeta } from '../lib/domain.js'
import { byId, matches, optionsOf } from '../lib/lookup.js'

const BLANK = {
  contact_id: '',
  kind: 'outreach',
  from_email: '',
  subject: '',
  body_text: '',
  status: 'sent',
  provider: '',
}

export default function Emails() {
  const emails = useAsync(() => emailsApi.list(), [])
  const contacts = useAsync(() => contactsApi.list(), [])
  const contactById = useMemo(() => byId(contacts.data), [contacts.data])
  const contactName = (id) => contactById[id]?.full_name ?? null

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [bouncing, setBouncing] = useState(null)
  const save = useSave()
  const act = useSave()

  const rows = emails.data ?? []
  const filtered = useMemo(
    () =>
      rows.filter(
        (e) =>
          (!kind || e.kind === kind) &&
          (!status || e.status === status) &&
          matches(query, e.to_email, e.subject, contactName(e.contact_id), e.from_email),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, kind, status, contactById],
  )

  const columns = [
    {
      key: 'sent_at',
      header: 'Sent',
      width: '13%',
      sortValue: (e) => new Date(e.sent_at ?? e.created_at).getTime(),
      render: (e) => <span className="text-ink-2">{relativeTime(e.sent_at ?? e.created_at)}</span>,
    },
    {
      key: 'contact_id',
      header: 'Contact',
      width: '17%',
      sortValue: (e) => contactName(e.contact_id),
      render: (e) => <span className="text-ink">{contactName(e.contact_id) ?? '—'}</span>,
    },
    { key: 'to_email', header: 'To', width: '20%', render: (e) => <span className="text-ink-2">{e.to_email}</span> },
    { key: 'kind', header: 'Kind', width: '11%', render: (e) => <span className="text-ink-2">{emailKindLabel(e.kind)}</span> },
    { key: 'subject', header: 'Subject', width: '28%' },
    {
      key: 'status',
      header: 'Status',
      width: '11%',
      sortValue: (e) => emailStatusMeta(e.status).label,
      render: (e) => <EmailStatus value={e.status} />,
    },
  ]

  async function onSave(values) {
    const payload = { ...values, provider: values.provider || null }
    const ok = await save.run(() => (editing?.id ? emailsApi.update(editing.id, editPayload(payload)) : emailsApi.create(payload)))
    if (ok) {
      setEditing(null)
      setSelected(null)
      emails.reload()
    }
  }

  async function onBounce() {
    const ok = await act.run(() => emailsApi.update(bouncing.id, { status: 'bounced' }))
    if (ok) {
      setBouncing(null)
      setSelected(null)
      emails.reload()
    }
  }

  async function onDelete() {
    const ok = await act.run(() => emailsApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      setSelected(null)
      emails.reload()
    }
  }

  const openForm = (value) => {
    save.clear()
    setEditing(value)
  }

  return (
    <Screen>
      <PageHeader
        title="Emails sent"
        count={emails.loading ? null : rows.length}
        description="Table 1: everything that went out"
        actions={
          <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
            <Plus size={14} />
            Record email
          </Button>
        }
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search address, subject, contact" />
          <FilterSelect value={kind} onChange={setKind} label="Filter by kind">
            <option value="">Any kind</option>
            {EMAIL_KINDS.map((k) => (
              <option key={k} value={k}>
                {emailKindLabel(k)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={status} onChange={setStatus} label="Filter by status">
            <option value="">Any status</option>
            {EMAIL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {emailStatusMeta(s).label}
              </option>
            ))}
          </FilterSelect>
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={emails.loading}
          error={emails.error}
          onRetry={emails.reload}
          onRowClick={setSelected}
          activeId={selected?.id}
          initialSort={{ key: 'sent_at', dir: 'desc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={Send}
                title="Nothing sent yet"
                body="Record each outreach, follow-up or transactional email here so replies can be matched to it."
                action={
                  <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
                    Record the first email
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Send}
                title="Nothing matches those filters"
                action={
                  <Button
                    onClick={() => {
                      setQuery('')
                      setKind('')
                      setStatus('')
                    }}
                  >
                    Clear filters
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
        title={selected?.subject ?? ''}
        subtitle={selected ? 'To ' + (contactName(selected.contact_id) ?? selected.to_email) : ''}
        footer={
          <>
            <Button variant="dangerGhost" onClick={() => { act.clear(); setDeleting(selected) }}>
              Delete
            </Button>
            {selected?.status !== 'bounced' && (
              <Button variant="ghost" onClick={() => { act.clear(); setBouncing(selected) }}>
                <MailWarning size={14} /> Mark bounced
              </Button>
            )}
            <Button variant="primary" onClick={() => openForm({ ...BLANK, ...selected, provider: selected.provider ?? '' })}>
              Edit
            </Button>
          </>
        }
      >
        {selected && (
          <>
            <DetailList>
              <DetailRow label="Status">
                <EmailStatus value={selected.status} />
                {selected.bounced_at && <span className="text-ink-3"> · bounced {formatDateTime(selected.bounced_at)}</span>}
              </DetailRow>
              <DetailRow label="Kind">{emailKindLabel(selected.kind)}</DetailRow>
              <DetailRow label="To">{selected.to_email}</DetailRow>
              <DetailRow label="From">{selected.from_email}</DetailRow>
              <DetailRow label="Sent" mono>
                {formatDateTime(selected.sent_at ?? selected.created_at)}
              </DetailRow>
              <DetailRow label="Provider">{selected.provider}</DetailRow>
              <DetailRow label="Message id" mono>
                {selected.provider_message_id}
              </DetailRow>
            </DetailList>
            <DetailSection title="Body">
              <pre className="whitespace-pre-wrap px-4 pb-4 font-sans text-sm leading-relaxed text-ink-2">
                {selected.body_text || <span className="text-ink-3">No body recorded.</span>}
              </pre>
            </DetailSection>
          </>
        )}
      </Drawer>

      <FormDrawer
        value={editing}
        fields={formFields(contacts.data ?? [], Boolean(editing?.id))}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={onSave}
        titleNew="Record email"
        titleEdit="Edit email"
        submitNew="Record"
        subtitle={editing?.id ? editing.to_email : 'An email you have sent. Addresses on the do-not-email list are refused.'}
      />

      <ConfirmDialog
        open={Boolean(bouncing)}
        onCancel={() => setBouncing(null)}
        onConfirm={onBounce}
        busy={act.busy}
        error={act.error}
        confirmLabel="Mark bounced"
        title="Mark this email as bounced?"
        body={'The address ' + (bouncing?.to_email ?? '') + ' joins the do-not-email list and no further email of any kind can be recorded to it.'}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={act.busy}
        error={act.error}
        title="Delete this email record?"
        body="Only possible if no response is linked to it."
      />
    </Screen>
  )
}

/** The update schema accepts fewer fields than create: the addressee never changes. */
const editPayload = ({ subject, body_text, provider, status, sent_at }) => ({ subject, body_text, provider, status, sent_at })

function formFields(contacts, isEdit) {
  return [
    ...(isEdit
      ? []
      : [
          {
            name: 'contact_id',
            label: 'Contact',
            type: 'select',
            required: true,
            options: optionsOf(contacts, (c) => c.full_name + ' · ' + c.email, 'Choose a contact'),
          },
        ]),
    { name: 'kind', label: 'Kind', type: 'select', span: 1, options: optionsFrom(EMAIL_KINDS, emailKindLabel) },
    { name: 'status', label: 'Status', type: 'select', span: 1, options: optionsFrom(EMAIL_STATUSES, (s) => emailStatusMeta(s).label) },
    { name: 'from_email', label: 'From', type: 'email', required: true, placeholder: 'you@lambtech.in' },
    { name: 'subject', label: 'Subject', required: true },
    { name: 'body_text', label: 'Body', type: 'textarea', rows: 6, nullable: true },
    { name: 'provider', label: 'Sent through', placeholder: 'gmail, titan, postmark', nullable: true },
  ]
}
