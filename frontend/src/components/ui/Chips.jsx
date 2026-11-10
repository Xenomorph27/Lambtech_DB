import {
  categoryMeta,
  emailStatusMeta,
  leadStatusMeta,
  priorityMeta,
  suppressionReasonMeta,
  transactionStatusMeta,
} from '../../lib/domain.js'

/**
 * Status chips and coloured words. Each pairs its colour with a word, so
 * meaning survives for anyone who cannot distinguish the hues.
 */

const CHIP = 'inline-flex items-center gap-1 rounded-control px-1.5 h-[19px] text-2xs tracking-tight'

export function PriorityChip({ value, compact = false }) {
  const meta = priorityMeta(value)
  return (
    <span className={CHIP + ' ' + meta.chip} title={'Priority: ' + meta.label}>
      {compact ? meta.short : meta.label}
    </span>
  )
}

export function CategoryChip({ value }) {
  const meta = categoryMeta(value)
  return (
    <span className={CHIP + ' ' + meta.chip} title={meta.bucket ? 'Table 2' + meta.bucket : 'Not yet sorted'}>
      {meta.label}
    </span>
  )
}

export function LeadStatus({ value }) {
  const meta = leadStatusMeta(value)
  return <span className={meta.text}>{meta.label}</span>
}

export function TransactionStatus({ value }) {
  const meta = transactionStatusMeta(value)
  return (
    <span className={'inline-flex items-center gap-1.5 ' + meta.text}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}

export function EmailStatus({ value }) {
  const meta = emailStatusMeta(value)
  return <span className={meta.text}>{meta.label}</span>
}

export function SuppressionReason({ value }) {
  const meta = suppressionReasonMeta(value)
  return <span className={meta.text}>{meta.label}</span>
}

/** A thin progress bar in the screen's hue; the number is always written beside it. */
export function ProgressBar({ pct, className = '' }) {
  const value = Math.max(0, Math.min(100, Number(pct) || 0))
  return (
    <span className={'inline-flex items-center gap-2 ' + className} title={value + '% done'}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-raised-2">
        <span className="block h-full rounded-full" style={{ width: value + '%', backgroundColor: 'var(--screen)' }} />
      </span>
      <span className="tnum text-xs text-ink-2">{value}%</span>
    </span>
  )
}
