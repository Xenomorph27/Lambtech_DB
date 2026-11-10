import { useMemo, useState } from 'react'
import { Plus, ShieldOff, Users } from 'lucide-react'
import { anonymizeContact, companies as companiesApi, contacts as contactsApi, emailsSent, responses } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { FilterSelect, SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { Button } from '../components/ui/Button.jsx'
import { CategoryChip, EmailStatus } from '../components/ui/Chips.jsx'
import { DetailList, DetailRow, DetailSection, Drawer } from '../components/ui/Drawer.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { FormDrawer, optionsFrom } from '../components/data/FormDrawer.jsx'
import { formatDate, formatDateShort, relativeTime } from '../lib/format.js'
import { CONTACT_SOURCES, emailKindLabel, sourceLabel } from '../lib/domain.js'
import { byId, matches, optionsOf } from '../lib/lookup.js'

const BLANK = {
  full_name: '',
  email: '',
  phone: '',
  job_title: '',
  company_id: '',
  source: 'manual',
  source_detail: '',
  notes: '',
}

export default function Contacts() {
  const contacts = useAsync(() => contactsApi.list(), [])
  const companies = useAsync(() => companiesApi.list(), [])
  const companyById = useMemo(() => byId(companies.data), [companies.data])
  const companyName = (id) => companyById[id]?.name ?? null

  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [company, setCompany] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [erasing, setErasing] = useState(null)
  const save = useSave()
  const destroy = useSave()

  const rows = contacts.data ?? []
  const filtered = useMemo(
    () =>
      rows.filter(
        (c) =>
          (!source || c.source === source) &&
          (!company || c.company_id === company) &&
          matches(query, c.full_name, c.email, c.phone, c.job_title, companyName(c.company_id)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, source, company, companyById],
  )

  const columns = [
    { key: 'full_name', header: 'Name', width: '18%', render: (c) => <span className="text-ink">{c.full_name}</span> },
    { key: 'email', header: 'Email', width: '22%', render: (c) => <span className="text-ink-2">{c.email}</span> },
    {
      key: 'company_id',
      header: 'Company',
      width: '16%',
      sortValue: (c) => companyName(c.company_id),
      render: (c) => companyName(c.company_id) ?? <span className="text-ink-3">Individual</span>,
    },
    { key: 'job_title', header: 'Title', width: '14%', render: (c) => c.job_title ?? <span className="text-ink-3">—</span> },
    { key: 'source', header: 'Source', width: '10%', render: (c) => <span className="text-ink-2">{sourceLabel(c.source)}</span> },
    { key: 'phone', header: 'Phone', width: '11%', mono: true, render: (c) => c.phone ?? <span className="text-ink-3">—</span> },
    {
      key: 'created_at',
      header: 'Added',
      width: '9%',
      align: 'right',
      sortValue: (c) => new Date(c.created_at ?? 0).getTime(),
      render: (c) => <span className="text-ink-2">{relativeTime(c.created_at)}</span>,
    },
  ]

  async function onSave(values) {
    const payload = { ...values, company_id: values.company_id || null }
    const ok = await save.run(() => (editing?.id ? contactsApi.update(editing.id, payload) : contactsApi.create(payload)))
    if (ok) {
      setEditing(null)
      contacts.reload()
      if (selected) setSelected(null)
    }
  }

  async function onDelete() {
    const ok = await destroy.run(() => contactsApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      setSelected(null)
      contacts.reload()
    }
  }

  async function onErase() {
    const ok = await destroy.run(() => anonymizeContact(erasing.id))
    if (ok) {
      setErasing(null)
      setSelected(null)
      contacts.reload()
    }
  }

  const openForm = (value) => {
    save.clear()
    setEditing(value)
  }

  return (
    <Screen>
      <PageHeader
        title="Contacts"
        count={contacts.loading ? null : rows.length}
        description="Every person, stored once"
        actions={
          <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
            <Plus size={14} />
            Add contact
          </Button>
        }
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, email, phone, company" />
          <FilterSelect value={source} onChange={setSource} label="Filter by source">
            <option value="">Any source</option>
            {CONTACT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={company} onChange={setCompany} label="Filter by company">
            <option value="">Any company</option>
            {(companies.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={contacts.loading}
          error={contacts.error}
          onRetry={contacts.reload}
          onRowClick={setSelected}
          activeId={selected?.id}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                body="Everyone you email, and everyone who writes in, lives here."
                action={
                  <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
                    Add the first contact
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Users}
                title="Nothing matches those filters"
                action={
                  <Button
                    onClick={() => {
                      setQuery('')
                      setSource('')
                      setCompany('')
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
        title={selected?.full_name ?? ''}
        subtitle={selected ? [selected.job_title, companyName(selected.company_id)].filter(Boolean).join(' · ') : ''}
        footer={
          <>
            <Button variant="dangerGhost" onClick={() => { destroy.clear(); setDeleting(selected) }}>
              Delete
            </Button>
            {!selected?.is_anonymized && (
              <Button variant="ghost" onClick={() => { destroy.clear(); setErasing(selected) }}>
                <ShieldOff size={14} /> Anonymize
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => openForm({ ...BLANK, ...selected, company_id: selected.company_id ?? '' })}
            >
              Edit contact
            </Button>
          </>
        }
      >
        {selected && (
          <>
            <DetailList>
              {selected.is_anonymized && (
                <DetailRow label="Erased">
                  <span className="text-ink-3">Personal data removed on request. History kept.</span>
                </DetailRow>
              )}
              <DetailRow label="Email">
                <a className="text-accent hover:underline" href={'mailto:' + selected.email}>
                  {selected.email}
                </a>
              </DetailRow>
              <DetailRow label="Secondary email">{selected.secondary_email}</DetailRow>
              <DetailRow label="Phone" mono>
                {selected.phone}
              </DetailRow>
              <DetailRow label="Company">{companyName(selected.company_id) ?? 'Individual'}</DetailRow>
              <DetailRow label="Source">
                {sourceLabel(selected.source)}
                {selected.source_detail && <span className="text-ink-3"> · {selected.source_detail}</span>}
              </DetailRow>
              <DetailRow label="Notes">{selected.notes}</DetailRow>
              <DetailRow label="Added" mono>
                {formatDate(selected.created_at)}
              </DetailRow>
            </DetailList>
            <ContactHistory contactId={selected.id} />
          </>
        )}
      </Drawer>

      <FormDrawer
        value={editing}
        fields={formFields(companies.data ?? [])}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={onSave}
        titleNew="Add contact"
        titleEdit="Edit contact"
        submitNew="Add contact"
        subtitle={editing?.id ? editing.email : 'One row per person; a new job is a new contact'}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={destroy.busy}
        error={destroy.error}
        title={'Delete ' + (deleting?.full_name ?? 'this contact') + '?'}
        body="Only possible for a contact with no emails, replies or leads. For anyone with history, use Anonymize instead."
      />

      <ConfirmDialog
        open={Boolean(erasing)}
        onCancel={() => setErasing(null)}
        onConfirm={onErase}
        busy={destroy.busy}
        error={destroy.error}
        confirmLabel="Anonymize"
        title={'Anonymize ' + (erasing?.full_name ?? 'this contact') + '?'}
        body="Name, emails, phones and message bodies are replaced with placeholders and the address joins the do-not-email list. Counts and payment history stay. This cannot be undone."
      />
    </Screen>
  )
}

/** What has passed between us and this person. */
function ContactHistory({ contactId }) {
  const emails = useAsync(() => emailsSent.list({ contact_id: contactId }), [contactId])
  const replies = useAsync(() => responses.list({ contact_id: contactId }), [contactId])
  return (
    <>
      <DetailSection title={'Emails sent' + (emails.data ? ' · ' + emails.data.length : '')}>
        <MiniList
          loading={emails.loading}
          rows={emails.data}
          empty="Nothing sent yet."
          render={(e) => (
            <>
              <span className="tnum w-14 shrink-0 text-ink-3">{formatDateShort(e.sent_at ?? e.created_at)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{e.subject}</span>
              <span className="shrink-0 text-ink-3">{emailKindLabel(e.kind)}</span>
              <EmailStatus value={e.status} />
            </>
          )}
        />
      </DetailSection>
      <DetailSection title={'Responses' + (replies.data ? ' · ' + replies.data.length : '')}>
        <MiniList
          loading={replies.loading}
          rows={replies.data}
          empty="No replies yet."
          render={(r) => (
            <>
              <span className="tnum w-14 shrink-0 text-ink-3">{formatDateShort(r.received_at)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{r.subject ?? '(no subject)'}</span>
              <CategoryChip value={r.category} />
            </>
          )}
        />
      </DetailSection>
    </>
  )
}

export function MiniList({ loading, rows, empty, render }) {
  if (loading) return <p className="px-4 pb-3 text-xs text-ink-3">Loading…</p>
  if (!rows || rows.length === 0) return <p className="px-4 pb-3 text-xs text-ink-3">{empty}</p>
  return (
    <ul className="divide-y divide-rule/60 pb-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 px-4 py-1.5 text-xs">
          {render(row)}
        </li>
      ))}
    </ul>
  )
}

function formFields(companies) {
  return [
    { name: 'full_name', label: 'Name', required: true, placeholder: 'Full name' },
    { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'name@company.com' },
    { name: 'phone', label: 'Phone', placeholder: '+91 98765 43210', span: 1, nullable: true },
    { name: 'job_title', label: 'Title', placeholder: 'CTO', span: 1, nullable: true },
    {
      name: 'company_id',
      label: 'Company',
      type: 'select',
      hint: 'Optional',
      nullable: true,
      options: optionsOf(companies, (c) => c.name, 'Individual'),
    },
    { name: 'source', label: 'Source', type: 'select', span: 1, options: optionsFrom(CONTACT_SOURCES, sourceLabel) },
    { name: 'source_detail', label: 'Source detail', placeholder: 'Event name, search, referrer', span: 1, nullable: true },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, nullable: true },
  ]
}
