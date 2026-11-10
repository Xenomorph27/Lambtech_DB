import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button.jsx'

/**
 * Right-side detail panel.
 *
 * A drawer rather than a separate page, because triage means checking one
 * record without losing your place in the list behind it. This arrival is the
 * one orchestrated motion in the app; everything else is instant.
 */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl' }) {
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="backdrop-in absolute inset-0 bg-black/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          'drawer-in relative flex h-full w-full flex-col border-l border-rule ' +
          'bg-panel shadow-2xl outline-none lift-flat ' +
          width
        }
      >
        <header className="flex items-start gap-3 border-b border-rule px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X size={15} />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-rule px-4 py-3">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  )
}

/** Key/value rows used inside drawers. */
export function DetailList({ children }) {
  return <dl className="divide-y divide-rule/70">{children}</dl>
}

export function DetailRow({ label, children, mono = false }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-4 py-2.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={'min-w-0 break-words text-ink ' + (mono ? 'tnum' : '')}>
        {children ?? <span className="text-ink-3">—</span>}
      </dd>
    </div>
  )
}

export function DetailSection({ title, action, children }) {
  return (
    <section className="border-t border-rule">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1.5">
        <h3 className="text-xs font-medium text-ink-2">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}
