import { AlertTriangle } from 'lucide-react'
import { Button } from './Button.jsx'

/** An empty screen is an invitation to act, so it always offers the next step. */
export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 grid h-9 w-9 place-items-center rounded-panel bg-raised text-ink-3">
          <Icon size={17} />
        </div>
      )}
      <p className="text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Errors say what happened and how to recover, in the interface voice. */
export function ErrorState({ error, onRetry }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-panel bg-heat-1/12 text-heat-2">
        <AlertTriangle size={17} />
      </div>
      <p className="text-ink">That did not load</p>
      <p className="mt-1 max-w-sm text-ink-3">
        {error?.message || 'The request failed before it returned anything.'}
      </p>
      {onRetry && (
        <div className="mt-4">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  )
}
