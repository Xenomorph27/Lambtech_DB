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
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Keep
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
