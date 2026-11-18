import { useState } from 'react'
import { AlertTriangle, Pause, Play } from 'lucide-react'
import { outreach } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { DetailSection } from '../components/ui/Drawer.jsx'
import { ErrorState } from '../components/ui/EmptyState.jsx'
import { TextInput } from '../components/ui/Field.jsx'
import { formatDateTime, relativeTime } from '../lib/format.js'

export default function Mailboxes() {
  const state = useAsync(() => outreach.state(), [])
  const boxes = useAsync(() => outreach.mailboxes(), [])
  const review = useAsync(() => outreach.review(), [])
  const events = useAsync(() => outreach.events(), [])
  const [confirmUnpause, setConfirmUnpause] = useState(false)
  const act = useSave()
  const s = state.data

  const reloadAll = () => {
    state.reload()
    boxes.reload()
    review.reload()
    events.reload()
  }

  async function setPaused(paused) {
    if (await act.run(() => outreach.setPaused(paused))) {
      setConfirmUnpause(false)
      reloadAll()
    }
  }

  return (
    <Screen>
      <PageHeader title="Mailboxes" description="The outreach engine: on/off, daily caps, inbox checks, anything needing a person" />
      <Panel className="overflow-y-auto">
        {state.error ? (
          <ErrorState error={state.error} onRetry={state.reload} />
        ) : (
          <DetailSection title="Engine">
            <div className="space-y-2 px-4 pb-4 text-sm">
              <div className="flex items-center gap-3">
                <span className={'text-base ' + (s?.paused ? 'text-heat-2' : 'text-[#00e093]')}>
                  {s ? (s.paused ? 'Paused' : 'Active') : '…'}
                </span>
                {s?.paused_reason && <span className="text-ink-2">{s.paused_reason}</span>}
                <span className="ml-auto" />
                {s && (s.paused ? (
                  <Button variant="primary" onClick={() => { act.clear(); setConfirmUnpause(true) }}>
                    <Play size={14} /> Unpause
                  </Button>
                ) : (
                  <Button onClick={() => setPaused(true)}>
                    <Pause size={14} /> Pause now
                  </Button>
                ))}
              </div>
              {s && !s.sending_enabled && (
                <p className="flex items-center gap-1.5 text-heat-3">
                  <AlertTriangle size={14} /> Sending is switched off on the engine itself (Stage 2 turns it on). Replies are still read and logged.
                </p>
              )}
              <p className="text-ink-2">
                Last cycle {s?.last_cycle_at ? relativeTime(s.last_cycle_at) : 'never'}
                {s?.engine_version ? ` · engine ${s.engine_version}` : ''} · {s?.queued ?? '…'} queued
              </p>
              <p className={s?.inbox_status === 'error' ? 'text-heat-1' : 'text-ink-2'}>
                Inbox check: {s?.inbox_status ?? '…'}
                {s?.last_inbox_check_at ? ` (${relativeTime(s.last_inbox_check_at)})` : ''}
                {s?.inbox_detail ? ` — ${s.inbox_detail}` : ''}
              </p>
              {act.error && !confirmUnpause && <p className="text-heat-1">{act.error}</p>}
            </div>
          </DetailSection>
        )}

        <DetailSection title="Mailboxes">
          <div className="divide-y divide-rule/60">
            {(boxes.data ?? []).length === 0 && !boxes.loading && (
              <p className="px-4 py-3 text-sm text-ink-3">No mailboxes yet. They appear after the engine's first cycle on Render.</p>
            )}
            {(boxes.data ?? []).map((box) => (
              <MailboxRow key={box.email} box={box} onSaved={boxes.reload} />
            ))}
          </div>
        </DetailSection>

        <DetailSection title={`Needs a person (${(review.data ?? []).length})`}>
          <ul className="divide-y divide-rule/60">
            {(review.data ?? []).length === 0 && <li className="px-4 py-3 text-sm text-ink-3">Nothing stuck or failed.</li>}
            {(review.data ?? []).map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{item.full_name}</span> <span className="text-ink-3">· {item.email} · {item.campaign} · email {item.step}</span>
                  <span className="block truncate text-xs text-heat-2">{item.error}</span>
                </span>
                <Button size="sm" onClick={async () => { if (await act.run(() => outreach.resolve(item.id, 'retry'))) reloadAll() }}>Retry</Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (await act.run(() => outreach.resolve(item.id, 'skip'))) reloadAll() }}>Skip</Button>
              </li>
            ))}
          </ul>
        </DetailSection>

        <DetailSection title="Recent engine events">
          <ul className="divide-y divide-rule/60 pb-2">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-1.5 text-xs">
                <span className="tnum w-36 shrink-0 text-ink-3">{formatDateTime(e.created_at)}</span>
                <span className="w-28 shrink-0 text-ink-2">{e.kind}</span>
                <span className="min-w-0 flex-1 text-ink">{e.detail}</span>
              </li>
            ))}
          </ul>
        </DetailSection>
      </Panel>

      <ConfirmDialog
        open={confirmUnpause}
        onCancel={() => setConfirmUnpause(false)}
        onConfirm={() => setPaused(false)}
        busy={act.busy}
        error={act.error}
        danger={false}
        confirmLabel="Unpause"
        title="Unpause the engine?"
        body="Queued emails will start going out within the daily caps, on weekdays 10:00–17:00 India time."
      />
    </Screen>
  )
}

function MailboxRow({ box, onSaved }) {
  const [cap, setCap] = useState(String(box.daily_cap))
  const save = useSave()
  const update = async (payload) => {
    if (await save.run(() => outreach.updateMailbox(box.email, payload))) onSaved()
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-ink">
        {box.email}
        {!box.configured && <span className="ml-2 text-xs text-heat-2">not configured on the engine</span>}
      </span>
      <span className="tnum text-ink-2">{box.sent_today} sent today</span>
      <TextInput className="w-20" type="number" min={0} max={500} value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Daily cap" />
      <Button size="sm" disabled={save.busy || cap === String(box.daily_cap)} onClick={() => update({ daily_cap: Number(cap) })}>
        Save cap
      </Button>
      <Button size="sm" variant={box.is_active ? 'ghost' : 'primary'} onClick={() => update({ is_active: !box.is_active })}>
        {box.is_active ? 'Switch off' : 'Switch on'}
      </Button>
      {save.error && <span className="text-xs text-heat-1">{save.error}</span>}
    </div>
  )
}
