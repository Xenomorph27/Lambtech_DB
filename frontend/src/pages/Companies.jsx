import { useMemo, useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { companies as companiesApi, contacts as contactsApi } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { Button } from '../components/ui/Button.jsx'
import { DetailList, DetailRow, DetailSection, Drawer } from '../components/ui/Drawer.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { FormDrawer } from '../components/data/FormDrawer.jsx'
import { formatDate, relativeTime } from '../lib/format.js'
import { matches } from '../lib/lookup.js'
import { MiniList } from './Contacts.jsx'

const BLANK = { name: '', domain: '', industry: '', city: '', country: 'India', website: '', notes: '' }

export default function Companies() {
  const companies = useAsync(() => companiesApi.list(), [])
  const contacts = useAsync(() => contactsApi.list(), [])

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const save = useSave()
  const destroy = useSave()

  const contactCount = useMemo(() => {
    const counts = {}
    for (const c of contacts.data ?? []) if (c.company_id) counts[c.company_id] = (counts[c.company_id] ?? 0) + 1
    return counts
  }, [contacts.data])

  const rows = companies.data ?? []
  const filtered = useMemo(
    () => rows.filter((c) => matches(query, c.name, c.domain, c.industry, c.city)),
    [rows, query],
  )

  const columns = [
    { key: 'name', header: 'Name', width: '24%', render: (c) => <span className="text-ink">{c.name}</span> },
    { key: 'domain', header: 'Domain', width: '18%', mono: true, render: (c) => c.domain ?? <span className="text-ink-3">—</span> },
    { key: 'industry', header: 'Industry', width: '18%', render: (c) => c.industry ?? <span className="text-ink-3">—</span> },
    { key: 'city', header: 'City', width: '14%', render: (c) => c.city ?? <span className="text-ink-3">—</span> },
    {
      key: 'contacts',
      header: 'Contacts',
      width: '12%',
      align: 'right',
      mono: true,
      sortValue: (c) => contactCount[c.id] ?? 0,
      render: (c) => contactCount[c.id] ?? <span className="text-ink-3">0</span>,
    },
    {
      key: 'created_at',
      header: 'Added',
      width: '14%',
      align: 'right',
      sortValue: (c) => new Date(c.created_at ?? 0).getTime(),
      render: (c) => <span className="text-ink-2">{relativeTime(c.created_at)}</span>,
    },
  ]

  async function onSave(values) {
    const ok = await save.run(() => (editing?.id ? companiesApi.update(editing.id, values) : companiesApi.create(values)))
    if (ok) {
      setEditing(null)
      setSelected(null)
      companies.reload()
    }
  }

  async function onDelete() {
    const ok = await destroy.run(() => companiesApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      setSelected(null)
      companies.reload()
    }
  }

  const openForm = (value) => {
    save.clear()
    setEditing(value)
  }

  const people = selected ? (contacts.data ?? []).filter((c) => c.company_id === selected.id) : []

  return (
    <Screen>
      <PageHeader
        title="Companies"
        count={companies.loading ? null : rows.length}
        description="Who the contacts work for"
        actions={
          <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
            <Plus size={14} />
            Add company
          </Button>
        }
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, domain, industry, city" />
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={companies.loading}
          error={companies.error}
          onRetry={companies.reload}
          onRowClick={setSelected}
          activeId={selected?.id}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No companies yet"
                body="Add a company to group its people and the work you do for it."
                action={
                  <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
                    Add the first company
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Building2} title="Nothing matches" action={<Button onClick={() => setQuery('')}>Clear search</Button>} />
            )
          }
        />
      </Panel>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected ? [selected.industry, selected.city].filter(Boolean).join(' · ') : ''}
        footer={
          <>
            <Button variant="dangerGhost" onClick={() => { destroy.clear(); setDeleting(selected) }}>
              Delete
            </Button>
            <Button variant="primary" onClick={() => openForm({ ...BLANK, ...selected })}>
              Edit company
            </Button>
          </>
        }
      >
        {selected && (
          <>
            <DetailList>
              <DetailRow label="Domain" mono>
                {selected.domain}
              </DetailRow>
              <DetailRow label="Website">
                {selected.website && (
                  <a className="text-accent hover:underline" href={selected.website} target="_blank" rel="noreferrer">
                    {selected.website}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Industry">{selected.industry}</DetailRow>
              <DetailRow label="Location">{[selected.city, selected.country].filter(Boolean).join(', ') || null}</DetailRow>
              <DetailRow label="Notes">{selected.notes}</DetailRow>
              <DetailRow label="Added" mono>
                {formatDate(selected.created_at)}
              </DetailRow>
            </DetailList>
            <DetailSection title={'Contacts · ' + people.length}>
              <MiniList
                loading={contacts.loading}
                rows={people}
                empty="No one from this company yet."
                render={(p) => (
                  <>
                    <span className="min-w-0 flex-1 truncate text-ink">{p.full_name}</span>
                    <span className="shrink-0 text-ink-3">{p.job_title}</span>
                    <span className="shrink-0 text-ink-2">{p.email}</span>
                  </>
                )}
              />
            </DetailSection>
          </>
        )}
      </Drawer>

      <FormDrawer
        value={editing}
        fields={FIELDS}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={onSave}
        titleNew="Add company"
        titleEdit="Edit company"
        submitNew="Add company"
        subtitle={editing?.id ? editing.domain : 'An organisation your contacts belong to'}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={destroy.busy}
        error={destroy.error}
        title={'Delete ' + (deleting?.name ?? 'this company') + '?'}
        body="Its contacts are kept and become individuals. A company with transactions cannot be deleted."
      />
    </Screen>
  )
}

const FIELDS = [
  { name: 'name', label: 'Name', required: true, placeholder: 'Acme Pvt Ltd' },
  { name: 'domain', label: 'Domain', placeholder: 'acme.com', span: 1, nullable: true },
  { name: 'industry', label: 'Industry', placeholder: 'Fintech', span: 1, nullable: true },
  { name: 'city', label: 'City', placeholder: 'Mumbai', span: 1, nullable: true },
  { name: 'country', label: 'Country', span: 1, nullable: true },
  { name: 'website', label: 'Website', placeholder: 'https://acme.com', nullable: true },
  { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, nullable: true },
]
