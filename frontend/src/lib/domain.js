/**
 * Domain vocabulary and its visual encoding, defined once.
 *
 * Values match the Postgres enums in supabase/migrations exactly. Colour and
 * word always travel together, so meaning survives for anyone who cannot
 * tell the hues apart. Blue is reserved for interaction and appears in none
 * of these encodings.
 */

/* --- Leads ----------------------------------------------------------------- */

/** An ORDINAL scale, read as one heat ramp: solid at the top, outline at the bottom. */
export const PRIORITIES = ['hot', 'warm', 'cold']

const PRIORITY_META = {
  hot: {
    label: 'Hot',
    short: 'HOT',
    // The only solid fill in the ramp. heat-1-ink is near-black: white on
    // this crimson measured only 3.65:1.
    chip: 'bg-heat-1 text-heat-1-ink font-semibold',
    dot: 'bg-heat-1',
    text: 'text-heat-1',
    rank: 3,
  },
  warm: {
    label: 'Warm',
    short: 'WARM',
    chip: 'bg-heat-2/15 text-heat-2 ring-1 ring-inset ring-heat-2/30',
    dot: 'bg-heat-2',
    text: 'text-heat-2',
    rank: 2,
  },
  cold: {
    label: 'Cold',
    short: 'COLD',
    chip: 'text-ink-3 ring-1 ring-inset ring-rule-strong',
    dot: 'bg-heat-5',
    text: 'text-ink-3',
    rank: 1,
  },
}

export const priorityMeta = (value) =>
  PRIORITY_META[value] ?? {
    label: value ? String(value) : 'Unset',
    short: '—',
    chip: 'text-ink-3 ring-1 ring-inset ring-rule',
    dot: 'bg-rule-strong',
    text: 'text-ink-3',
    rank: 0,
  }

/** A PIPELINE position: cool to warm as the lead progresses, two final outcomes. */
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']

const LEAD_STATUS_META = {
  new: { label: 'New', text: 'text-accent', open: true },
  contacted: { label: 'Contacted', text: 'text-ink', open: true },
  qualified: { label: 'Qualified', text: 'text-heat-3', open: true },
  proposal: { label: 'Proposal', text: 'text-heat-2', open: true },
  won: { label: 'Won', text: 'text-won', open: false },
  lost: { label: 'Lost', text: 'text-lost line-through decoration-lost/50', open: false },
}

export const leadStatusMeta = (value) =>
  LEAD_STATUS_META[value] ?? { label: value ? String(value) : 'Unset', text: 'text-ink-2', open: true }

/* --- Responses ------------------------------------------------------------- */

export const RESPONSE_CATEGORIES = ['unclassified', 'auto_reply', 'negative', 'unsubscribe', 'positive']

/** bucket: which of the two sub-tables (A / B) the category lands in. */
const CATEGORY_META = {
  unclassified: { label: 'Unclassified', bucket: null, text: 'text-ink-3', chip: 'text-ink-3 ring-1 ring-inset ring-rule-strong' },
  auto_reply: { label: 'Auto-reply', bucket: 'A', text: 'text-ink-2', chip: 'bg-raised text-ink-2 ring-1 ring-inset ring-rule' },
  negative: { label: 'Negative', bucket: 'A', text: 'text-heat-2', chip: 'bg-heat-2/15 text-heat-2 ring-1 ring-inset ring-heat-2/30' },
  unsubscribe: { label: 'Unsubscribe', bucket: 'A', text: 'text-heat-1', chip: 'bg-heat-1/15 text-heat-1 ring-1 ring-inset ring-heat-1/30' },
  positive: { label: 'Positive', bucket: 'B', text: 'text-won', chip: 'bg-won/15 text-won ring-1 ring-inset ring-won/30' },
}

export const categoryMeta = (value) =>
  CATEGORY_META[value] ?? { label: value ? String(value) : 'Unset', bucket: null, text: 'text-ink-3', chip: 'text-ink-3 ring-1 ring-inset ring-rule' }

export const RESPONSE_CHANNELS = ['email_reply', 'inbound_form', 'phone', 'whatsapp', 'other']

const CHANNEL_LABEL = {
  email_reply: 'Email reply',
  inbound_form: 'Website form',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  other: 'Other',
}
export const channelLabel = (value) => CHANNEL_LABEL[value] ?? (value ? String(value) : '—')

/* --- Emails sent ----------------------------------------------------------- */

export const EMAIL_KINDS = ['outreach', 'follow_up', 'transactional']
const KIND_LABEL = { outreach: 'Outreach', follow_up: 'Follow-up', transactional: 'Transactional' }
export const emailKindLabel = (value) => KIND_LABEL[value] ?? (value ? String(value) : '—')

export const EMAIL_STATUSES = ['queued', 'sent', 'delivered', 'bounced', 'failed']
const EMAIL_STATUS_META = {
  queued: { label: 'Queued', text: 'text-ink-3' },
  sent: { label: 'Sent', text: 'text-ink-2' },
  delivered: { label: 'Delivered', text: 'text-won' },
  bounced: { label: 'Bounced', text: 'text-heat-1' },
  failed: { label: 'Failed', text: 'text-heat-2' },
}
export const emailStatusMeta = (value) => EMAIL_STATUS_META[value] ?? { label: value ? String(value) : '—', text: 'text-ink-3' }

/* --- Contacts -------------------------------------------------------------- */

export const CONTACT_SOURCES = ['inbound_form', 'apollo', 'linkedin', 'referral', 'event', 'import', 'manual', 'other']
const SOURCE_LABEL = {
  inbound_form: 'Website form',
  apollo: 'Apollo',
  linkedin: 'LinkedIn',
  referral: 'Referral',
  event: 'Event',
  import: 'Import',
  manual: 'Manual',
  other: 'Other',
}
export const sourceLabel = (value) => SOURCE_LABEL[value] ?? (value ? String(value) : '—')

/* --- Transactions ---------------------------------------------------------- */

export const TRANSACTION_STATUSES = ['active', 'on_hold', 'completed', 'cancelled']
const TRANSACTION_STATUS_META = {
  active: { label: 'Active', text: 'text-accent' },
  on_hold: { label: 'On hold', text: 'text-heat-3' },
  completed: { label: 'Completed', text: 'text-won' },
  cancelled: { label: 'Cancelled', text: 'text-lost line-through decoration-lost/50' },
}
export const transactionStatusMeta = (value) =>
  TRANSACTION_STATUS_META[value] ?? { label: value ? String(value) : '—', text: 'text-ink-2' }

export const PAYMENT_METHODS = ['bank_transfer', 'upi', 'card', 'cash', 'other']
const METHOD_LABEL = { bank_transfer: 'Bank transfer', upi: 'UPI', card: 'Card', cash: 'Cash', other: 'Other' }
export const paymentMethodLabel = (value) => METHOD_LABEL[value] ?? (value ? String(value) : '—')

/* --- Suppressions ---------------------------------------------------------- */

export const SUPPRESSION_REASONS = ['unsubscribed', 'bounced', 'complained', 'manual', 'erased']
const REASON_META = {
  unsubscribed: { label: 'Unsubscribed', text: 'text-heat-2' },
  bounced: { label: 'Bounced', text: 'text-heat-1' },
  complained: { label: 'Complained', text: 'text-heat-1' },
  manual: { label: 'Added by hand', text: 'text-ink-2' },
  erased: { label: 'Erased (DPDP)', text: 'text-ink-3' },
}
export const suppressionReasonMeta = (value) => REASON_META[value] ?? { label: value ? String(value) : '—', text: 'text-ink-3' }
