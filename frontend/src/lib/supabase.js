/**
 * Staff login, through Supabase Auth.
 *
 * Only switched on when BOTH the API and Supabase are configured:
 *
 *   VITE_API_BASE_URL      the FastAPI backend
 *   VITE_SUPABASE_URL      https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY the project's publishable ("anon") key
 *
 * The publishable key is designed to sit in browser code. It identifies the
 * project; it does not grant access to data. What protects the data is the
 * backend refusing any request without a signed-in staff member's token.
 *
 * With any of them unset, the app runs as before: sample data, no login, which
 * is what the standalone demo deployment needs.
 */
import { createClient } from '@supabase/supabase-js'

const URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').trim()
const KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const AUTH_ENABLED = URL.length > 0 && KEY.length > 0

export const supabase = AUTH_ENABLED
  ? createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

/** The current access token, refreshed by the client if it is close to expiry. */
export async function accessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
