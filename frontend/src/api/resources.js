/** One handle per collection of spec §10.2, plus the two routes that are not CRUD. */

import { http, makeResource } from './client.js'

export const companies = makeResource('companies', 'Company')
export const contacts = makeResource('contacts', 'Contact')
export const emailsSent = makeResource('emails-sent', 'Email')
export const responses = makeResource('responses', 'Response')
export const leads = makeResource('leads', 'Lead')
export const transactions = makeResource('transactions', 'Transaction')
export const milestones = makeResource('milestones', 'Milestone')
export const payments = makeResource('payments', 'Payment')
export const suppressions = makeResource('suppressions', 'Suppression')
export const enquiries = makeResource('enquiries', 'Enquiry')

/** Turn an enquiry into a contact + lead in one step. Resolves to the new lead. */
export const confirmEnquiry = (id, payload) => http(`/enquiries/${id}/confirm`, { method: 'POST', body: payload })

/** Erase a person for a DPDP request. The rows stay; the personal data goes. */
export const anonymizeContact = (id) => http(`/contacts/${id}/anonymize`, { method: 'POST' })

export const overviewStats = () => http('/stats/overview')

const formOf = (fields) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return form
}

/** The outreach engine, through the desk API (campaigns, queue, controls). */
export const outreach = {
  campaigns: () => http('/outreach/campaigns'),
  campaign: (id) => http(`/outreach/campaigns/${id}`),
  recipients: (id) => http(`/outreach/campaigns/${id}/recipients`),
  inspectCsv: (file) => http('/outreach/csv-columns', { method: 'POST', form: formOf({ file }) }),
  createCampaign: ({ name, file, steps }) =>
    http('/outreach/campaigns', { method: 'POST', form: formOf({ name, steps: JSON.stringify(steps), file }) }),
  queue: (id) => http(`/outreach/campaigns/${id}/queue`, { method: 'POST' }),
  removeCampaign: (id) => http(`/outreach/campaigns/${id}`, { method: 'DELETE' }),
  editMessage: (id, payload) => http(`/outreach/messages/${id}`, { method: 'PATCH', body: payload }),
  stopRecipient: (id) => http(`/outreach/recipients/${id}/stop`, { method: 'POST' }),
  state: () => http('/outreach/state'),
  setPaused: (paused, reason) => http('/outreach/state', { method: 'PATCH', body: { paused, reason } }),
  mailboxes: () => http('/outreach/mailboxes'),
  updateMailbox: (email, payload) =>
    http(`/outreach/mailboxes/${encodeURIComponent(email)}`, { method: 'PATCH', body: payload }),
  events: () => http('/outreach/events', { query: { limit: 50 } }),
  review: () => http('/outreach/review'),
  resolve: (id, action) => http(`/outreach/messages/${id}/resolve`, { method: 'POST', body: { action } }),
  sentOrigins: () => http('/outreach/sent-origins'),
  dashboard: () => http('/outreach/dashboard'),
}
