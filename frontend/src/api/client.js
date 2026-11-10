/**
 * The one HTTP client between the screens and the FastAPI backend.
 *
 * There is no sample-data mode here: every screen reads and writes the real
 * database, so VITE_API_BASE_URL must be set. An unset value is reported in
 * plain words instead of as a wall of failed requests.
 */

import { accessToken, supabase } from '../lib/supabase.js'

/** Trailing slashes are stripped so joining paths cannot produce "//contacts". */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

export const API_BASE_URL = API_BASE
export const API_CONFIGURED = API_BASE.length > 0

export class ApiError extends Error {
  constructor(status, message, options) {
    // options carries { cause } so the original fetch failure is kept.
    super(message, options)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * FastAPI puts its message in `detail`, so that is unwrapped here rather than
 * surfacing "[object Object]". A 204 has no body, and calling .json() on it
 * throws, which would turn a successful delete into a visible error.
 */
export async function http(path, { method = 'GET', body, query } = {}) {
  if (!API_CONFIGURED) {
    throw new ApiError(0, 'VITE_API_BASE_URL is not set, so the desk does not know where its API is.')
  }

  let url = API_BASE + path
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value))
    }
    const qs = params.toString()
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }

  // Every call carries the signed-in staff member's token; the backend
  // refuses anything without one.
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = await accessToken()
  if (token) headers.Authorization = 'Bearer ' + token

  let response
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch (cause) {
    // fetch only rejects when the request never completed: API down, wrong
    // URL, or CORS. Said plainly, because the browser's own message blames
    // the network.
    throw new ApiError(
      0,
      `Cannot reach the API at ${API_BASE}. Is the backend running, and is this origin allowed by CORS?`,
      { cause },
    )
  }

  // A 401 means the session is gone (expired, revoked, signed out elsewhere).
  // Signing out sends the person back to the login screen instead of leaving
  // every table showing the same error.
  if (response.status === 401 && supabase) await supabase.auth.signOut()

  if (response.status === 204) return { ok: true }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    const detail =
      (payload && typeof payload === 'object' && payload.detail) ||
      (typeof payload === 'string' && payload) ||
      response.statusText
    throw new ApiError(response.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return payload
}

/**
 * Default page size. Larger than the backend's own default because these
 * screens show whole tables; still a cap, past which the screens need real
 * pagination.
 */
const DEFAULT_LIMIT = 500

export function makeResource(collection, label) {
  const base = `/${collection}`
  return {
    list: ({ skip = 0, limit = DEFAULT_LIMIT, ...filters } = {}) => http(base, { query: { skip, limit, ...filters } }),
    get: (id) => http(`${base}/${id}`),
    create: (payload) => http(base, { method: 'POST', body: payload }),
    update: (id, payload) => http(`${base}/${id}`, { method: 'PATCH', body: payload }),
    remove: async (id) => {
      await http(`${base}/${id}`, { method: 'DELETE' })
      return { ok: true }
    },
    _label: label,
  }
}
