import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Briefcase, Check, Plus, Trash2 } from 'lucide-react'
import {
  companies as companiesApi,
  leads as leadsApi,
  milestones as milestonesApi,
  payments as paymentsApi,
  transactions as transactionsApi,
} from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { FilterSelect, SearchInput, Toolbar } from '../components/data/Toolbar.jsx'
import { StatRow, StatTile } from '../components/data/StatTile.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ProgressBar, TransactionStatus } from '../components/ui/Chips.jsx'
import { DetailList, DetailRow, DetailSection, Drawer } from '../components/ui/Drawer.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Select, TextInput } from '../components/ui/Field.jsx'
import { FormDrawer, optionsFrom } from '../components/data/FormDrawer.jsx'
import { formatAmount, formatAmountExact, formatDate, toInputDate } from '../lib/format.js'
import { PAYMENT_METHODS, TRANSACTION_STATUSES, paymentMethodLabel, transactionStatusMeta } from '../lib/domain.js'
import { byId, matches, optionsOf } from '../lib/lookup.js'

const BLANK = {
  lead_id: '',
  company_id: '',
  title: '',
  scope: '',
  start_date: '',
  deadline: '',
  total_amount: '',
  status: 'active',
}

const DUE_FILTERS = [
  { value: '', label: 'Any deadline' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'soon', label: 'Due in 14 days' },
]

export default function Transactions() {
  const transactions = useAsync(() => transactionsApi.list(), [])
  const leads = useAsync(() => leadsApi.list(), [])
  const companies = useAsync(() => companiesApi.list(), [])
  const leadById = useMemo(() => byId(leads.data), [leads.data])
  const companyById = useMemo(() => byId(companies.data), [companies.data])
  const [params, setParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [due, setDue] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const save = useSave()
  const destroy = useSave()

  const rows = transactions.data ?? []
  const clientOf = (t) => companyById[t.company_id]?.name ?? leadById[t.lead_id]?.full_name ?? null

  // "Start transaction" on a lead lands here with the form open for that lead.
  useEffect(() => {
    if (params.get('new') && leads.data) {
      const lead = leadById[params.get('lead')]
      save.clear()
      setEditing({ ...BLANK, lead_id: lead?.id ?? '', company_id: lead?.company_id ?? '' })
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, leads.data])

  // Keep the open drawer in step with the list after a change below it.
  useEffect(() => {
    if (selected && transactions.data) {
      const fresh = transactions.data.find((t) => t.id === selected.id)
      if (fresh && fresh !== selected) setSelected(fresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions.data])

  const filtered = useMemo(
    () =>
      rows.filter(
        (t) =>
          (!status || t.status === status) &&
          (due !== 'overdue' || t.is_overdue) &&
          (due !== 'soon' || (t.days_left != null && t.days_left >= 0 && t.days_left <= 14 && !['completed', 'cancelled'].includes(t.status))) &&
          matches(query, t.title, leadById[t.lead_id]?.serial_no, clientOf(t), t.scope),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, status, due, leadById, companyById],
  )

  const columns = [
    { key: 'title', header: 'Work', width: '22%', render: (t) => <span className="text-ink">{t.title}</span> },
    {
      key: 'lead_id',
      header: 'Lead',
      width: '8%',
      mono: true,
      sortValue: (t) => leadById[t.lead_id]?.serial_no,
      render: (t) => <span className="text-ink-2">{leadById[t.lead_id]?.serial_no ?? '—'}</span>,
    },
    { key: 'client', header: 'Client', width: '15%', sortValue: clientOf, render: (t) => clientOf(t) ?? <span className="text-ink-3">—</span> },
    { key: 'progress_pct', header: 'Progress', width: '13%', render: (t) => <ProgressBar pct={t.progress_pct} /> },
    {
      key: 'amount_paid',
      header: 'Paid / total',
      width: '15%',
      align: 'right',
      mono: true,
      render: (t) => (
        <span>
          <span className="text-ink">{formatAmount(t.amount_paid)}</span>
          <span className="text-ink-3"> / {formatAmount(t.total_amount)}</span>
        </span>
      ),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      width: '15%',
      sortValue: (t) => (t.deadline ? new Date(t.deadline).getTime() : null),
      render: (t) => <Deadline t={t} />,
    },
    { key: 'status', header: 'Status', width: '12%', sortValue: (t) => transactionStatusMeta(t.status).label, render: (t) => <TransactionStatus value={t.status} /> },
  ]

  async function onSave(values) {
    const payload = {
      ...values,
      company_id: values.company_id || null,
      start_date: values.start_date || null,
      deadline: values.deadline || null,
    }
    const ok = await save.run(() =>
      editing?.id ? transactionsApi.update(editing.id, editPayload(payload)) : transactionsApi.create(payload),
    )
    if (ok) {
      setEditing(null)
      transactions.reload()
    }
  }

  async function onDelete() {
    const ok = await destroy.run(() => transactionsApi.remove(deleting.id))
    if (ok) {
      setDeleting(null)
      setSelected(null)
      transactions.reload()
    }
  }

  const openForm = (value) => {
    save.clear()
    setEditing(value)
  }

  return (
    <Screen>
      <PageHeader
        title="Transactions"
        count={transactions.loading ? null : rows.length}
        description="Table 4: paid work, how far along, what is owed"
        actions={
          <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
            <Plus size={14} />
            New transaction
          </Button>
        }
      />

      <Panel>
        <Toolbar count={filtered.length} total={rows.length}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search work, lead, client" />
          <FilterSelect value={status} onChange={setStatus} label="Filter by status">
            <option value="">Any status</option>
            {TRANSACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {transactionStatusMeta(s).label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={due} onChange={setDue} label="Filter by deadline">
            {DUE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </FilterSelect>
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={transactions.loading}
          error={transactions.error}
          onRetry={transactions.reload}
          onRowClick={setSelected}
          activeId={selected?.id}
          initialSort={{ key: 'deadline', dir: 'asc' }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No transactions yet"
                body="Start one from a lead, then track milestones and payments against it."
                action={
                  <Button variant="primary" onClick={() => openForm({ ...BLANK })}>
                    New transaction
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Briefcase}
                title="Nothing matches those filters"
                action={
                  <Button
                    onClick={() => {
                      setQuery('')
                      setStatus('')
                      setDue('')
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
        width="max-w-2xl"
        title={selected?.title ?? ''}
        subtitle={selected ? [leadById[selected.lead_id]?.serial_no, clientOf(selected)].filter(Boolean).join(' · ') : ''}
        footer={
          <>
            <Button variant="dangerGhost" onClick={() => { destroy.clear(); setDeleting(selected) }}>
              Delete
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                openForm({
                  ...BLANK,
                  ...selected,
                  company_id: selected.company_id ?? '',
                  scope: selected.scope ?? '',
                  start_date: toInputDate(selected.start_date),
                  deadline: toInputDate(selected.deadline),
                })
              }
            >
              Edit
            </Button>
          </>
        }
      >
        {selected && (
          <>
            <StatRow>
              <StatTile label="Paid" value={formatAmount(selected.amount_paid)} />
              <StatTile
                label="Remaining"
                value={formatAmount(selected.amount_remaining)}
                accent={Number(selected.amount_remaining) > 0 ? '#ffc61a' : '#00e093'}
              />
              <StatTile label="Progress" value={selected.progress_pct + '%'} sub={selected.milestones_done + ' of ' + selected.milestones_total + ' milestones'} />
              <StatTile
                label="Deadline"
                value={selected.deadline ? formatDate(selected.deadline) : '—'}
                sub={daysLeftText(selected)}
                accent={selected.is_overdue ? '#ff2d55' : undefined}
              />
            </StatRow>
            <DetailList>
              <DetailRow label="Status">
                <TransactionStatus value={selected.status} />
              </DetailRow>
              <DetailRow label="Lead">
                {leadById[selected.lead_id] ? leadById[selected.lead_id].serial_no + ' · ' + leadById[selected.lead_id].full_name : null}
              </DetailRow>
              <DetailRow label="Client">{clientOf(selected)}</DetailRow>
              <DetailRow label="Total" mono>
                {formatAmountExact(selected.total_amount)} {selected.currency}
              </DetailRow>
              <DetailRow label="Dates" mono>
                {selected.start_date || selected.deadline
                  ? formatDate(selected.start_date) + ' → ' + formatDate(selected.deadline)
                  : null}
              </DetailRow>
              <DetailRow label="Scope">{selected.scope}</DetailRow>
            </DetailList>
            <Milestones transaction={selected} onChange={transactions.reload} />
            <Payments transaction={selected} onChange={transactions.reload} />
          </>
        )}
      </Drawer>

      <FormDrawer
        value={editing}
        fields={formFields(leads.data ?? [], companies.data ?? [], Boolean(editing?.id))}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={onSave}
        titleNew="New transaction"
        titleEdit="Edit transaction"
        submitNew="Start"
        subtitle={editing?.id ? '' : 'A piece of paid work for a lead'}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        busy={destroy.busy}
        error={destroy.error}
        title={'Delete ' + (deleting?.title ?? 'this transaction') + '?'}
        body="Its milestones go with it. A transaction with payments recorded cannot be deleted; cancel it instead."
      />
    </Screen>
  )
}

function daysLeftText(t) {
  if (t.days_left == null) return 'No deadline'
  if (['completed', 'cancelled'].includes(t.status)) return transactionStatusMeta(t.status).label
  if (t.days_left < 0) return Math.abs(t.days_left) + ' days overdue'
  if (t.days_left === 0) return 'Due today'
  return t.days_left + ' days left'
}

function Deadline({ t }) {
  if (!t.deadline) return <span className="text-ink-3">—</span>
  const closed = ['completed', 'cancelled'].includes(t.status)
  return (
    <span className={t.is_overdue ? 'text-heat-1' : closed ? 'text-ink-3' : t.days_left <= 14 ? 'text-heat-3' : 'text-ink-2'}>
      {formatDate(t.deadline)}
      {!closed && <span className="text-ink-3"> · {daysLeftText(t)}</span>}
    </span>
  )
}

/** Checklist that drives the transaction's status: all done → completed. */
function Milestones({ transaction, onChange }) {
  const list = useAsync(() => milestonesApi.list({ transaction_id: transaction.id }), [transaction.id])
  const [title, setTitle] = useState('')
  const act = useSave()
  const rows = (list.data ?? []).slice().sort((a, b) => a.position - b.position)

  const refresh = () => {
    list.reload()
    onChange()
  }

  async function toggle(m) {
    if (await act.run(() => milestonesApi.update(m.id, { is_done: !m.is_done }))) refresh()
  }
  async function add(event) {
    event.preventDefault()
    if (!title.trim()) return
    const position = rows.length ? Math.max(...rows.map((m) => m.position)) + 1 : 1
    if (await act.run(() => milestonesApi.create({ transaction_id: transaction.id, title: title.trim(), position }))) {
      setTitle('')
      refresh()
    }
  }
  async function remove(m) {
    if (await act.run(() => milestonesApi.remove(m.id))) refresh()
  }

  return (
    <DetailSection title={'Milestones · ' + rows.filter((m) => m.is_done).length + ' of ' + rows.length + ' done'}>
      <ul className="divide-y divide-rule/60">
        {rows.map((m) => (
          <li key={m.id} className="group flex items-center gap-3 px-4 py-1.5 text-sm">
            <button
              type="button"
              onClick={() => toggle(m)}
              disabled={act.busy}
              aria-pressed={m.is_done}
              aria-label={(m.is_done ? 'Undo ' : 'Complete ') + m.title}
              className={
                'grid h-4 w-4 shrink-0 place-items-center rounded-[4px] ring-1 ring-inset transition-colors ' +
                (m.is_done ? 'bg-won text-[#04121f] ring-won' : 'ring-rule-strong hover:ring-accent')
              }
            >
              {m.is_done && <Check size={11} strokeWidth={3} />}
            </button>
            <span className={'min-w-0 flex-1 truncate ' + (m.is_done ? 'text-ink-3 line-through' : 'text-ink')}>{m.title}</span>
            {m.due_date && <span className="tnum text-xs text-ink-3">{formatDate(m.due_date)}</span>}
            <button
              type="button"
              onClick={() => remove(m)}
              aria-label={'Delete ' + m.title}
              className="text-ink-3 opacity-0 transition-opacity hover:text-heat-2 group-hover:opacity-100 focus:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        {!list.loading && rows.length === 0 && <li className="px-4 py-2 text-xs text-ink-3">No milestones yet. Add the steps of the work below.</li>}
      </ul>
      <form onSubmit={add} className="flex items-center gap-2 px-4 pb-3 pt-1.5">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone, e.g. Discovery" aria-label="New milestone" className="h-7 text-xs" />
        <Button type="submit" size="sm" disabled={act.busy || !title.trim()}>
          Add
        </Button>
      </form>
      {act.error && <p className="px-4 pb-3 text-xs text-heat-2" role="alert">{act.error}</p>}
    </DetailSection>
  )
}

/** Money in. The totals above are recomputed by the database from these rows. */
function Payments({ transaction, onChange }) {
  const list = useAsync(() => paymentsApi.list({ transaction_id: transaction.id }), [transaction.id])
  const [form, setForm] = useState({ amount: '', paid_on: toInputDate(new Date().toISOString()), method: 'bank_transfer', reference: '' })
  const act = useSave()
  const rows = (list.data ?? []).slice().sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1))

  const refresh = () => {
    list.reload()
    onChange()
  }
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))

  async function add(event) {
    event.preventDefault()
    const payload = {
      transaction_id: transaction.id,
      amount: Number(form.amount),
      paid_on: form.paid_on || null,
      method: form.method || null,
      reference: form.reference || null,
    }
    if (await act.run(() => paymentsApi.create(payload))) {
      setForm((f) => ({ ...f, amount: '', reference: '' }))
      refresh()
    }
  }
  async function remove(p) {
    if (await act.run(() => paymentsApi.remove(p.id))) refresh()
  }

  return (
    <DetailSection title={'Payments · ' + formatAmount(transaction.amount_paid) + ' received'}>
      <ul className="divide-y divide-rule/60">
        {rows.map((p) => (
          <li key={p.id} className="group flex items-center gap-3 px-4 py-1.5 text-sm">
            <span className="tnum w-24 shrink-0 text-xs text-ink-3">{formatDate(p.paid_on)}</span>
            <span className="tnum text-ink">{formatAmountExact(p.amount)}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
              {paymentMethodLabel(p.method)}
              {p.reference && ' · ' + p.reference}
            </span>
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label={'Delete payment of ' + formatAmountExact(p.amount)}
              className="text-ink-3 opacity-0 transition-opacity hover:text-heat-2 group-hover:opacity-100 focus:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        {!list.loading && rows.length === 0 && <li className="px-4 py-2 text-xs text-ink-3">Nothing received yet.</li>}
      </ul>
      <form onSubmit={add} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 px-4 pb-3 pt-1.5">
        <TextInput type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="Amount ₹" aria-label="Amount" className="h-7 text-xs" />
        <TextInput type="date" value={form.paid_on} onChange={set('paid_on')} aria-label="Paid on" className="h-7 text-xs" />
        <Select value={form.method} onChange={set('method')} aria-label="Method" className="h-7 text-xs">
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabel(m)}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" disabled={act.busy || !(Number(form.amount) > 0)}>
          Add
        </Button>
        <TextInput value={form.reference} onChange={set('reference')} placeholder="Reference: UTR, invoice no." aria-label="Reference" className="col-span-4 h-7 text-xs" />
      </form>
      {act.error && <p className="px-4 pb-3 text-xs text-heat-2" role="alert">{act.error}</p>}
    </DetailSection>
  )
}

const editPayload = ({ company_id, title, scope, start_date, deadline, total_amount, status }) => ({
  company_id,
  title,
  scope,
  start_date,
  deadline,
  total_amount,
  status,
})

function formFields(leads, companies, isEdit) {
  return [
    ...(isEdit
      ? []
      : [
          {
            name: 'lead_id',
            label: 'Lead',
            type: 'select',
            required: true,
            options: optionsOf(leads, (l) => l.serial_no + ' · ' + l.full_name + (l.company_name ? ' · ' + l.company_name : ''), 'Choose a lead'),
          },
        ]),
    { name: 'title', label: 'Work', required: true, placeholder: 'AI readiness audit' },
    {
      name: 'company_id',
      label: 'Client company',
      type: 'select',
      hint: 'Blank for an individual',
      nullable: true,
      options: optionsOf(companies, (c) => c.name, 'Individual client'),
    },
    { name: 'total_amount', label: 'Total amount (₹)', type: 'number', required: true, span: 1 },
    { name: 'status', label: 'Status', type: 'select', span: 1, options: optionsFrom(TRANSACTION_STATUSES, (s) => transactionStatusMeta(s).label) },
    { name: 'start_date', label: 'Start', type: 'date', span: 1, nullable: true },
    { name: 'deadline', label: 'Deadline', type: 'date', span: 1, nullable: true },
    { name: 'scope', label: 'Scope', type: 'textarea', rows: 4, nullable: true, placeholder: 'What is included' },
  ]
}
