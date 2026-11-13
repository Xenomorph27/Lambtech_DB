/**
 * Per-screen identity.
 *
 * Each screen owns a hue so you can tell at a glance which room you are in.
 * That hue is applied to CHROME ONLY - the sidebar's active item, the page
 * header, the hover tint on rows and columns - never inside a data cell, so it
 * cannot be confused with the priority and status encodings in domain.js.
 *
 * Exactly one hue is visible at a time and the screen name is always written
 * next to it, so the hues only need to differ from their sidebar neighbours.
 */
const SCREENS = {
  '/': { key: 'overview', label: 'Overview', accent: '#3d9bff' },
  '/enquiries': { key: 'enquiries', label: 'Enquiries', accent: '#ffb03a' },
  '/emails': { key: 'emails', label: 'Emails sent', accent: '#d96bff' },
  '/responses': { key: 'responses', label: 'Responses', accent: '#ff7eb6' },
  '/leads': { key: 'leads', label: 'Leads', accent: '#17c8d4' },
  '/transactions': { key: 'transactions', label: 'Transactions', accent: '#55d94f' },
  '/contacts': { key: 'contacts', label: 'Contacts', accent: '#2fd08a' },
  '/companies': { key: 'companies', label: 'Companies', accent: '#7b85ff' },
  '/suppressions': { key: 'suppressions', label: 'Do-not-email', accent: '#ff6f59' },
}

const FALLBACK = { key: 'other', label: '', accent: '#8093b0' }

export function screenTheme(pathname) {
  if (pathname === '/') return SCREENS['/']
  const match = Object.keys(SCREENS).find((path) => path !== '/' && pathname.startsWith(path))
  return match ? SCREENS[match] : FALLBACK
}

export const screenAccent = (pathname) => screenTheme(pathname).accent

/** Sidebar links read their own hue, so each destination previews its screen. */
export const accentFor = (path) => (SCREENS[path] ?? FALLBACK).accent
