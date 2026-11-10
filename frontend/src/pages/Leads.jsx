import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Briefcase, Plus, UserRound } from 'lucide-react'
import { contacts as contactsApi, leads as leadsApi } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { FilterSelect, PriorityFilter, SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { Button } from '../components/ui/Button.jsx'
import { LeadStatus, PriorityChip } from '../components/ui/Chips.jsx'
import { DetailList, DetailRow, Drawer } from '../components/ui/Drawer.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { FormDrawer, optionsFrom } from '../components/data/FormDrawer.jsx'
import { formatDate, relativeTime } from '../lib/format.js'
import { LEAD_STATUSES, PRIORITIES, leadStatusMeta, priorityMeta } from '../lib/domain.js'
import { matches, optionsOf } from '../lib/lookup.js'

const BLANK = { contact_id: '', priority: 'warm', status: 'new', description: '' }

export default function Leads() {
  const leads = useAsync(() => leadsApi.list(), [])
  const contacts = useAsync(() => contactsApi.list(), [])
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const save = useSave()
  const destroy = useSave()

  const rows = leads.data ?? []

  // Arriving from a reply ("Lead LT-0007 created → Open lead") opens that lead.
  const wanted = params.get('serial')
  useEffect(() => {
    if (!wanted || !leads.data) return
    const hit = leads.data.find((l) => l.serial_no === wanted)
    if (hit) setSelected(hit)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, leads.data])

  const filtered = useMemo(
    () =>
      rows.filter(
        (l) =>
          (!priority || l.priority === priority) &&
          (!status || l.status === status) &&
          matches(query, l.serial_no, l.full_name, l.email, l.phone, l.company_name, l.description),
      ),
    [rows, query, priority, status],
  )

  const columns = [
    { key: 'serial_no', header: 'Serial', width: '9%', mono: true, render: (l) => <span className="text-ink-2">{l.serial_no}</span> },
    { key: 'full_name', header: 'Name', width: '17%', render: (l) => <span className="text-ink">{l.full_name}</span> },
    { key: 'company_name', header: 'Company', width: '15%', render: (l) => l.company_name ?? <span className="text-ink-3">Individual</span> },
    {
      key: 'priority',
      header: 'Priority',
      width: '10%',
      // Sorts by rank, not alphabetically, so the scale reads in its real order.
      sortValue: (l) => priorityMeta(l.priority).rank,
      render: (l) => <PriorityChip value={l.priority} />,
    },
    { key: 'status', header: 'Status', width: '11%', sortValue: (l) => leadStatusMeta(l.status).label, render: (l) => <LeadStatus value={l.status} /> },
    { key: 'email', header: 'Email', width: '18%', render: (l) => <span className="text-ink-2">{l.email}</span> },
    { key: 'phone', header: 'Phone', width: '11%', mono: true, render: (l) => l.phone ?? <span className="text-ink-3">—</span> },
    {
      key: 'created_at',
      header: 'Added',
      width: '9%',
      align: 'right',
      sortValue: (l) => new Date(l.created_at ?? 0).getTime(),
      render: (l) => <span className="text-ink-2">{relativeTime(l.created_at)}</span>,
    },
  ]

  async function onSave(values) {
    const ok = await save.run(() =>
      editing?.id ? leadsApi.update(editing.id, editPayload(values)) : leadsApi.create(values),
    )
    if (ok) {
      setEditing(null)
      setSelected(null)
      leads.reload()
    }
  }

  async function onDelete() {
    const ok = await destroy.run(() => leadsApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      setSelected(null)
      leads.reload()
    }
  }

  const openForm = (value) => {
    save.clear()
    setEditing(value)
  }

  return (
    <Screen>
      <PageHeader
        title="Leads"
        count={leads.loading ? null : rows.length}
        description="Table 3: positive replies, numbered and prioritised"
        actions={
          <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
            <Plus size={14} />
            Add lead
          </Button>
        }
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search serial, name, company, email" />
          <PriorityFilter value={priority} onChange={setPriority} />
          <FilterSelect value={status} onChange={setStatus} label="Filter by status">
            <option value="">Any status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {leadStatusMeta(s).label}
              </option>
            ))}
          </FilterSelect>
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={leads.loading}
          error={leads.error}
          onRetry={leads.reload}
          onRowClick={setSelected}
          activeId={selected?.id}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={UserRound}
                title="No leads yet"
                body="Marking a response Positive creates a lead here automatically. You can also add one by hand."
                action={
                  <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
                    Add a lead
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={UserRound}
                title="Nothing matches those filters"
                action={
                  <Button
                    onClick={() => {
                      setQuery('')
                      setPriority('')
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
        title={selected ? selected.serial_no + ' · ' + selected.full_name : ''}
        subtitle={selected?.company_name ?? 'Individual'}
        footer={
          <>
            <Button variant="dangerGhost" onClick={() => { destroy.clear(); setDeleting(selected) }}>
              Delete
            </Button>
            <Button onClick={() => openForm({ ...BLANK, ...selected })}>Edit lead</Button>
            <Button variant="primary" onClick={() => navigate('/transactions?new=1&lead=' + selected.id)}>
              <Briefcase size={14} /> Start transaction
            </Button>
          </>
        }
      >
        {selected && (
          <DetailList>
            <DetailRow label="Priority">
              <PriorityChip value={selected.priority} />
            </DetailRow>
            <DetailRow label="Status">
              <LeadStatus value={selected.status} />
            </DetailRow>
            <DetailRow label="Email">
              <a className="text-accent hover:underline" href={'mailto:' + selected.email}>
                {selected.email}
              </a>
            </DetailRow>
            <DetailRow label="Phone" mono>
              {selected.phone}
            </DetailRow>
            <DetailRow label="Company">{selected.company_name ?? 'Individual'}</DetailRow>
            <DetailRow label="Description">{selected.description}</DetailRow>
            <DetailRow label="Came from">
              {selected.response_id ? (
                <Link to="/responses?tab=b" className="inline-flex items-center gap-1 text-accent hover:underline">
                  A positive reply <ArrowRight size={12} />
                </Link>
              ) : (
                <span className="text-ink-3">Entered by hand</span>
              )}
            </DetailRow>
            <DetailRow label="Added" mono>
              {formatDate(selected.created_at)}
            </DetailRow>
          </DetailList>
        )}
      </Drawer>

      <FormDrawer
        value={editing}
        fields={formFields(contacts.data ?? [], Boolean(editing?.id))}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={onSave}
        titleNew="Add lead"
        titleEdit={'Edit ' + (editing?.serial_no ?? 'lead')}
        submitNew="Add lead"
        subtitle={editing?.id ? editing.full_name : 'Gets the next LT- serial number automatically'}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={destroy.busy}
        error={destroy.error}
        title={'Delete ' + (deleting?.serial_no ?? 'this lead') + '?'}
        body="Its serial number is never reused. A lead with a transaction cannot be deleted; mark it Lost instead."
      />
    </Screen>
  )
}

const editPayload = ({ priority, status, description }) => ({ priority, status, description })

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
    { name: 'priority', label: 'Priority', type: 'select', span: 1, options: optionsFrom(PRIORITIES, (p) => priorityMeta(p).label) },
    { name: 'status', label: 'Status', type: 'select', span: 1, options: optionsFrom(LEAD_STATUSES, (s) => leadStatusMeta(s).label) },
    { name: 'description', label: 'Description', type: 'textarea', rows: 4, nullable: true, placeholder: 'What they want, budget, timing' },
  ]
}
