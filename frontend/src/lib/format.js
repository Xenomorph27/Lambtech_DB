/** Display formatting. Nothing here touches data shape, only presentation. */

// Indian rupees, Indian digit grouping (₹1,00,000).
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const moneyExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

export const formatAmount = (value) => (value == null || value === '' ? '—' : money.format(Number(value)))
export const formatAmountExact = (value) => (value == null || value === '' ? '—' : moneyExact.format(Number(value)))

/** Compact form for tiles: ₹1.2L, ₹3.4Cr. */
export function formatCompact(value) {
  const n = Number(value ?? 0)
  const abs = Math.abs(n)
  if (abs >= 1_00_00_000) return '₹' + (n / 1_00_00_000).toFixed(2).replace(/\.?0+$/, '') + 'Cr'
  if (abs >= 1_00_000) return '₹' + (n / 1_00_000).toFixed(2).replace(/\.?0+$/, '') + 'L'
  if (abs >= 1_000) return '₹' + Math.round(n / 1_000) + 'k'
  return '₹' + Math.round(n)
}

const asDate = (value) => (value ? new Date(value) : null)

export function formatDate(value) {
  const d = asDate(value)
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateShort(value) {
  const d = asDate(value)
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function formatDateTime(value) {
  const d = asDate(value)
  if (!d || Number.isNaN(d.getTime())) return '—'
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  )
}

/** Days from now: negative is past. */
export function daysUntil(value) {
  const d = asDate(value)
  if (!d || Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - Date.now()) / 86400000)
}

/** Plain-language time, written the way a person would say it. */
export function relativeTime(value) {
  const days = daysUntil(value)
  if (days === null) return '—'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) {
    if (days < 30) return 'in ' + days + ' days'
    if (days < 365) return 'in ' + Math.round(days / 30) + ' months'
    return 'in ' + (days / 365).toFixed(1) + ' years'
  }
  const ago = Math.abs(days)
  if (ago < 30) return ago + ' days ago'
  if (ago < 365) return Math.round(ago / 30) + ' months ago'
  return (ago / 365).toFixed(1) + ' years ago'
}

const pad = (n) => String(n).padStart(2, '0')

/** Today, in the browser's own time zone, for an <input type="date">. */
export function todayInput() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** A moment for an <input type="datetime-local">, in local time; now when no value. */
export function toInputDateTime(value) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  return todayInputFor(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

const todayInputFor = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

/** The reverse: what a datetime-local input holds, as an ISO instant for the API. */
export const fromInputDateTime = (value) => (value ? new Date(value).toISOString() : null)

/** A date for an <input type="date">, or '' when there is none. */
export const toInputDate = (value) => (value ? String(value).slice(0, 10) : '')

/** snake_case to Sentence case, for values shown without a label table. */
export const humanise = (value) =>
  !value ? '—' : String(value).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export const initialsOf = (name) =>
  !name
    ? '?'
    : name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
