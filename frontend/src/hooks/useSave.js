import { useState } from 'react'

/**
 * Busy flag plus the last error, for drawers that save or delete.
 *
 * `run(fn)` resolves true when fn succeeded, false when it threw; the error
 * message is kept for the drawer to show, in the API's own words.
 */
export function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(err?.message || 'That did not save.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run, clear: () => setError(null) }
}
