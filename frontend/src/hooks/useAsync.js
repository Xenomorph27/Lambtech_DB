import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async loader and tracks loading, error and data.
 *
 * Every screen uses this so the three states are handled identically
 * everywhere rather than reinvented per page. `reload()` re-runs the loader,
 * which is how a screen refreshes after a create, edit or delete.
 *
 * A result that arrives after the component unmounts, or after a newer call
 * started, is discarded rather than applied.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const callId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(() => {
    const id = ++callId.current
    setState((prev) => ({ ...prev, loading: true, error: null }))
    Promise.resolve()
      .then(loader)
      .then((data) => {
        if (mounted.current && id === callId.current) {
          setState({ data, error: null, loading: false })
        }
      })
      .catch((error) => {
        if (mounted.current && id === callId.current) {
          setState({ data: null, error, loading: false })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])

  return { ...state, reload: run }
}
