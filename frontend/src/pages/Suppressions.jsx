import { useMemo, useState } from 'react'
import { MailX, Plus } from 'lucide-react'
import { suppressions as suppressionsApi } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { FilterSelect, SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { Button } from '../components/ui/Button.jsx'
import { SuppressionReason } from '../components/ui/Chips.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { FormDrawer, optionsFrom } from '../components/data/FormDrawer.jsx'
import { formatDateTime } from '../lib/format.js'
import { SUPPRESSION_REASONS, suppressionReasonMeta } from '../lib/domain.js'
import { matches } from '../lib/lookup.js'

const BLANK = { email: '', reason: 'manual', source: 'manual' }

/** The do-not-email list. Entries are not edited: remove and re-add instead. */
export default function Suppressions() {
  const list = useAsync(() => suppressionsApi.list(), [])
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const save = useSave()
  const destroy = useSave()

  const rows = list.data ?? []
  const filtered = useMemo(
    () => rows.filter((s) => (!reason || s.reason === reason) && matches(query, s.email, s.source)),
    [rows, query, reason],
  )

  const columns = [
    { key: 'email', header: 'Email', width: '36%', render: (s) => <span className="text-ink">{s.email}</span> },
    { key: 'reason', header: 'Reason', width: '18%', sortValue: (s) => suppressionReasonMeta(s.reason).label, render: (s) => <SuppressionReason value={s.reason} /> },
    { key: 'source', header: 'Added by', width: '22%', mono: true, render: (s) => <span className="text-ink-3">{s.source ?? '—'}</span> },
    {
      key: 'created_at',
      header: 'Added',
      width: '16%',
      align: 'right',
      sortValue: (s) => new Date(s.created_at ?? 0).getTime(),
      render: (s) => <span className="text-ink-2">{formatDateTime(s.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '8%',
      align: 'right',
      sortable: false,
      render: (s) => (
        <Button
          variant="dangerGhost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            destroy.clear()
            setDeleting(s)
          }}
        >
          Remove
        </Button>
      ),
    },
  ]

  async function onSave(values) {
    const ok = await save.run(() => suppressionsApi.create(values))
    if (ok) {
      setEditing(null)
      list.reload()
    }
  }

  async function onDelete() {
    const ok = await destroy.run(() => suppressionsApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      list.reload()
    }
  }

  return (
    <Screen>
      <PageHeader
        title="Do-not-email"
        count={list.loading ? null : rows.length}
        description="Addresses no outreach may go to. Bounced addresses block every kind of email."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              save.clear()
              setEditing({ ...BLANK })
            }}
          >
            <Plus size={14} />
            Add address
          </Button>
        }
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search address" />
          <FilterSelect value={reason} onChange={setReason} label="Filter by reason">
            <option value="">Any reason</option>
            {SUPPRESSION_REASONS.map((r) => (
              <option key={r} value={r}>
                {suppressionReasonMeta(r).label}
              </option>
            ))}
          </FilterSelect>
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={MailX}
                title="The list is empty"
                body="Unsubscribes, bounces and erasure requests are added here automatically. Add anyone else who asked not to be contacted."
              />
            ) : (
              <EmptyState
                icon={MailX}
                title="Nothing matches"
                action={
                  <Button
                    onClick={() => {
                      setQuery('')
                      setReason('')
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

      <FormDrawer
        value={editing}
        fields={FIELDS}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={onSave}
        titleNew="Add to do-not-email"
        titleEdit="Add to do-not-email"
        submitNew="Add"
        subtitle="Outreach and follow-ups to this address will be refused"
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={destroy.busy}
        error={destroy.error}
        confirmLabel="Remove"
        title={'Allow email to ' + (deleting?.email ?? 'this address') + ' again?'}
        body="Only do this if the person asked to hear from you again. A bounced address will usually bounce again."
      />
    </Screen>
  )
}

const FIELDS = [
  { name: 'email', label: 'Email address', type: 'email', required: true, placeholder: 'name@company.com' },
  { name: 'reason', label: 'Reason', type: 'select', options: optionsFrom(SUPPRESSION_REASONS, (r) => suppressionReasonMeta(r).label) },
  { name: 'source', label: 'Note', placeholder: 'Who asked, where', nullable: true },
]
