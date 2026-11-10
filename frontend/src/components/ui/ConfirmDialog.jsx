import { useEffect } from 'react'
import { Button } from './Button.jsx'

/** Centred confirmation for actions that destroy something. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel = 'Delete',
  busy = false,
  error = null,
  danger = true,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="backdrop-in absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="lift relative w-full max-w-sm rounded-panel border border-rule bg-panel p-4 shadow-2xl"
      >
        <h2 className="text-base font-medium text-ink">{title}</h2>
        <p className="mt-1.5 text-ink-2">{body}</p>
        {error && (
          <p className="mt-3 rounded-control bg-heat-1/12 px-3 py-2 text-xs text-heat-2" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            {danger ? 'Keep' : 'Cancel'}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
