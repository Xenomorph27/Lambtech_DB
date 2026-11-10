/**
 * A single figure with its label. Kept flat against the panel with a rule
 * rather than boxed in a card, so a row of these reads as one instrument
 * cluster instead of four separate widgets.
 */
export function StatTile({ label, value, sub, accent }) {
  return (
    <div className="border-l border-rule px-4 py-2.5 first:border-l-0 first:pl-0">
      <div className="text-xs text-ink-3">{label}</div>
      <div
        className="tnum mt-1 text-xl leading-none text-ink"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-3">{sub}</div>}
    </div>
  )
}

export function StatRow({ children }) {
  return (
    <div className="flex flex-wrap items-stretch divide-rule border-b border-rule px-4 py-1">
      {children}
    </div>
  )
}
