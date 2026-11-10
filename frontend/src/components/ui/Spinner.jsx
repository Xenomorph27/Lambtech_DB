/** Indeterminate wait. Deliberately quiet: it should not draw the eye. */
export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={'animate-spin text-ink-3 ' + className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function LoadingRows({ rows = 6, cols = 5 }) {
  return (
    <tbody aria-busy="true">
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-rule/60">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-2">
              <div
                className="h-3 rounded-sm bg-raised-2/70"
                style={{ width: c === 0 ? '62%' : c === cols - 1 ? '38%' : '78%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export function LoadingPanel({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-10 text-ink-3" aria-busy="true">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}
