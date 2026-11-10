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

/** Erase a person for a DPDP request. The rows stay; the personal data goes. */
export const anonymizeContact = (id) => http(`/contacts/${id}/anonymize`, { method: 'POST' })

export const overviewStats = () => http('/stats/overview')
