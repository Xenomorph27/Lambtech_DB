import { useMemo, useRef, useState } from 'react'
import { Megaphone, Plus, Send } from 'lucide-react'
import { outreach } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { Drawer, DetailSection } from '../components/ui/Drawer.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Field, TextArea, TextField, TextInput } from '../components/ui/Field.jsx'
import { FormDrawer } from '../components/data/FormDrawer.jsx'
import { formatDateTime, relativeTime } from '../lib/format.js'

const DEFAULT_STEPS = [
  { step: 1, subject: 'A quick idea for {company}', body: 'Hi {first_name},\n\n', wait_days: 1 },
  { step: 2, subject: 'Re: A quick idea for {company}', body: 'Hi {first_name},\n\nFollowing up on my note below.', wait_days: 3 },
  { step: 3, subject: 'Re: A quick idea for {company}', body: 'Hi {first_name},\n\nOne last note from me.', wait_days: 4 },
]

const MESSAGE_TONE = {
  draft: 'text-ink-3',
  approved: 'text-accent',
  sending: 'text-heat-3',
  sent: 'text-[#00e093]',
  failed: 'text-heat-1',
  skipped: 'text-ink-3',
  needs_review: 'text-heat-2',
}

export default function Campaigns() {
  const list = useAsync(() => outreach.campaigns(), [])
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(null)
  const rows = list.data ?? []

  const columns = [
    { key: 'name', header: 'Campaign', width: '30%', render: (c) => <span className="text-ink">{c.name}</span> },
    { key: 'recipients', header: 'People', width: '10%', align: 'right', mono: true },
    { key: 'drafts', header: 'Drafts', width: '10%', align: 'right', mono: true },
    { key: 'queued', header: 'Queued', width: '10%', align: 'right', mono: true },
    { key: 'sent', header: 'Sent', width: '10%', align: 'right', mono: true },
    { key: 'replied', header: 'Replied', width: '10%', align: 'right', mono: true },
    {
      key: 'problems',
      header: 'Problems',
      width: '10%',
      align: 'right',
      mono: true,
      render: (c) => <span className={c.problems ? 'text-heat-1' : 'text-ink-3'}>{c.problems}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      width: '10%',
      align: 'right',
      sortValue: (c) => new Date(c.created_at).getTime(),
      render: (c) => <span className="text-ink-2">{relativeTime(c.created_at)}</span>,
    },
  ]

  return (
    <Screen>
      <PageHeader
        title="Campaigns"
        count={list.loading ? null : rows.length}
        description="Upload a list, write the emails, queue them; the engine sends within caps and hours"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New campaign
          </Button>
        }
      />
      <Panel>
        <DataTable
          columns={columns}
          rows={rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onRowClick={(c) => setOpenId(c.id)}
          activeId={openId}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          empty={
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              body="Upload a CSV of people (an Apollo export works as it is), write up to three emails, then queue them."
              action={<Button variant="primary" onClick={() => setCreating(true)}>New campaign</Button>}
            />
          }
        />
      </Panel>

      <NewCampaign
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false)
          list.reload()
          setOpenId(id)
        }}
      />
      <CampaignDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />
    </Screen>
  )
}

function NewCampaign({ open, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [followUps, setFollowUps] = useState(true)
  const [steps, setSteps] = useState(DEFAULT_STEPS)
  const [report, setReport] = useState(null)
  const lastField = useRef({ step: 1, field: 'body' })
  const save = useSave()
  const inspect = useSave()

  function reset() {
    setName('')
    setFile(null)
    setPreview(null)
    setSteps(DEFAULT_STEPS)
    setFollowUps(true)
    setReport(null)
    save.clear()
  }

  async function chooseFile(event) {
    const chosen = event.target.files?.[0] ?? null
    setFile(chosen)
    setPreview(null)
    if (chosen) await inspect.run(async () => setPreview(await outreach.inspectCsv(chosen)))
  }

  const setStep = (step, field) => (event) =>
    setSteps((all) => all.map((s) => (s.step === step ? { ...s, [field]: event.target.value } : s)))

  function insertTag(tag) {
    const { step, field } = lastField.current
    setSteps((all) => all.map((s) => (s.step === step ? { ...s, [field]: s[field] + '{' + tag + '}' } : s)))
  }

  async function submit() {
    const chosen = followUps ? steps : steps.slice(0, 1)
    let result = null
    const ok = await save.run(async () => {
      result = await outreach.createCampaign({
        name,
        file,
        steps: chosen.map((s) => ({ ...s, wait_days: Number(s.wait_days) })),
      })
    })
    if (ok) setReport(result)
  }

  const visible = followUps ? steps : steps.slice(0, 1)

  return (
    <Drawer
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={report ? 'Campaign created' : 'New campaign'}
      subtitle={report ? name : 'Nothing is sent until you queue it, and the engine is unpaused'}
      width="max-w-2xl"
      footer={
        report ? (
          <Button
            variant="primary"
            onClick={() => {
              const id = report.campaign_id
              reset()
              onCreated(id)
            }}
          >
            Review the drafts
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={save.busy || !name.trim() || !file} onClick={submit}>
              {save.busy ? 'Checking addresses…' : 'Create drafts'}
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="space-y-2 p-4 text-sm">
          <p className="text-ink">{report.added} people added, each with their drafts.</p>
          <ul className="space-y-1 text-ink-2">
            <li>{report.already_contacted} skipped: already emailed before</li>
            <li>{report.suppressed} skipped: on the do-not-email list or erased</li>
            <li>{report.duplicates} skipped: listed twice in the file</li>
            <li>{report.bad_domain} skipped: their domain does not exist or takes no mail</li>
            <li>{report.invalid} skipped: not a valid address</li>
          </ul>
          {report.unknown_tags.length > 0 && (
            <p className="text-heat-2">
              These tags matched no column and were left as written: {report.unknown_tags.map((t) => '{' + t + '}').join(' ')}.
              Edit those drafts before queueing.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <TextField label="Campaign name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="CA firms, Mumbai, November" />
          <Field label="People (CSV)" required hint="Needs an email column. Save from Excel as CSV UTF-8.">
            <TextInput type="file" accept=".csv,text/csv" onChange={chooseFile} />
          </Field>
          {inspect.error && <p className="text-sm text-heat-1">{inspect.error}</p>}
          {preview && (
            <div className="text-xs text-ink-2">
              <p className="mb-1">
                {preview.rows} rows{preview.is_apollo ? ' · Apollo export' : ''}. Click a tag to add it where you were typing:
              </p>
              <div className="flex flex-wrap gap-1">
                {['first_name', 'name', 'company', 'role', ...preview.columns.map((c) => c.tag)]
                  .filter((tag, i, all) => all.indexOf(tag) === i)
                  .map((tag) => (
                    <button key={tag} type="button" className="rounded-control bg-raised px-1.5 py-0.5 text-ink hover:bg-raised-2" onClick={() => insertTag(tag)}>
                      {'{' + tag + '}'}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={followUps} onChange={(e) => setFollowUps(e.target.checked)} />
            Send two follow-ups to people who do not reply
          </label>
          {visible.map((s) => (
            <DetailSection key={s.step} title={s.step === 1 ? 'Email 1' : `Follow-up ${s.step - 1}`}>
              <div className="space-y-2 px-4 pb-3">
                {s.step > 1 && (
                  <TextField
                    label="Days after the previous email"
                    type="number"
                    min={1}
                    max={60}
                    value={s.wait_days}
                    onChange={setStep(s.step, 'wait_days')}
                  />
                )}
                <TextField
                  label="Subject"
                  value={s.subject}
                  onChange={setStep(s.step, 'subject')}
                  onFocus={() => (lastField.current = { step: s.step, field: 'subject' })}
                />
                <Field label="Message">
                  <TextArea
                    rows={6}
                    value={s.body}
                    onChange={setStep(s.step, 'body')}
                    onFocus={() => (lastField.current = { step: s.step, field: 'body' })}
                  />
                </Field>
              </div>
            </DetailSection>
          ))}
          {save.error && <p className="text-sm text-heat-1">{save.error}</p>}
        </div>
      )}
    </Drawer>
  )
}

function CampaignDrawer({ id, onClose, onChanged }) {
  const campaign = useAsync(() => (id ? outreach.campaign(id) : null), [id])
  const people = useAsync(() => (id ? outreach.recipients(id) : null), [id])
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const act = useSave()
  const save = useSave()

  const all = useMemo(() => people.data ?? [], [people.data])
  const counts = useMemo(() => {
    const messages = all.flatMap((p) => p.messages)
    return {
      drafts: messages.filter((m) => m.status === 'draft').length,
      sent: messages.filter((m) => ['sent', 'sending', 'needs_review', 'failed'].includes(m.status)).length,
    }
  }, [all])

  const refresh = () => {
    people.reload()
    onChanged()
  }

  async function runConfirmed() {
    const ok = await act.run(async () => {
      if (confirm === 'queue') await outreach.queue(id)
      if (confirm === 'delete') await outreach.removeCampaign(id)
    })
    if (ok) {
      const was = confirm
      setConfirm(null)
      if (was === 'delete') {
        onChanged()
        onClose()
      } else refresh()
    }
  }

  async function saveMessage(values) {
    const ok = await save.run(() => outreach.editMessage(editing.id, { subject: values.subject, body: values.body }))
    if (ok) {
      setEditing(null)
      people.reload()
    }
  }

  return (
    <>
      <Drawer
        open={Boolean(id)}
        onClose={onClose}
        title={campaign.data?.name ?? 'Campaign'}
        subtitle={all.length + ' people'}
        width="max-w-3xl"
        footer={
          <>
            {counts.sent === 0 && (
              <Button variant="dangerGhost" onClick={() => { act.clear(); setConfirm('delete') }}>
                Delete campaign
              </Button>
            )}
            <Button variant="primary" disabled={counts.drafts === 0} onClick={() => { act.clear(); setConfirm('queue') }}>
              <Send size={14} /> Queue {counts.drafts} drafts
            </Button>
          </>
        }
      >
        <div className="divide-y divide-rule/60">
          {people.loading && <p className="p-4 text-xs text-ink-3">Loading…</p>}
          {all.map((person) => (
            <div key={person.id} className="px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {person.full_name} <span className="text-ink-3">· {person.email}</span>
                </span>
                <span className="text-xs text-ink-2">{person.status}{person.stop_reason ? ` (${person.stop_reason})` : ''}</span>
                {['pending', 'active'].includes(person.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await act.run(() => outreach.stopRecipient(person.id))) refresh()
                    }}
                  >
                    Stop
                  </Button>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {person.messages.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-ink-3">Email {m.step}</span>
                    <span className={'w-24 shrink-0 ' + (MESSAGE_TONE[m.status] ?? 'text-ink-2')}>{m.status.replace('_', ' ')}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{m.subject}</span>
                    {m.due_at && m.status === 'approved' && <span className="text-ink-3">due {formatDateTime(m.due_at)}</span>}
                    {['draft', 'approved'].includes(m.status) && (
                      <button type="button" className="text-accent hover:underline" onClick={() => { save.clear(); setEditing(m) }}>
                        Edit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {act.error && !confirm && <p className="p-4 text-sm text-heat-1">{act.error}</p>}
        </div>
      </Drawer>

      <FormDrawer
        value={editing}
        fields={[
          { name: 'subject', label: 'Subject', type: 'text', required: true },
          { name: 'body', label: 'Message', type: 'textarea', rows: 12, required: true },
        ]}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={saveMessage}
        titleEdit={editing ? `Edit email ${editing.step}` : ''}
        subtitle="Only this person's copy changes"
        width="max-w-2xl"
      />

      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
        busy={act.busy}
        error={act.error}
        danger={confirm === 'delete'}
        confirmLabel={confirm === 'queue' ? 'Queue' : 'Delete'}
        title={confirm === 'queue' ? `Queue ${counts.drafts} drafts?` : 'Delete this campaign?'}
        body={
          confirm === 'queue'
            ? 'They will be sent by the engine within the daily caps and weekday hours, once the engine is unpaused. Anyone now on the do-not-email list is left out.'
            : 'Its people and drafts are removed. Their contact records stay.'
        }
      />
    </>
  )
}
