import { Search, X } from 'lucide-react'
import { PRIORITIES } from '../../lib/domain.js'
import { priorityMeta } from '../../lib/domain.js'

/** Filter bar above a table. Sits on the panel, not in a card. */
export function Toolbar({ children, count, total }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
      {children}
      <div className="ml-auto tnum text-xs text-ink-3">
        {count === total ? total + ' rows' : count + ' of ' + total}
      </div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="relative">
      <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-7 w-56 rounded-control bg-ground pl-7 pr-7 text-sm text-ink placeholder:text-ink-3 ring-1 ring-inset ring-rule-strong outline-none transition-shadow focus:ring-2 focus:ring-accent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-ink-3 hover:text-ink"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

export function FilterSelect({ value, onChange, children, label }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="h-7 rounded-control bg-ground pl-2 pr-6 text-sm text-ink ring-1 ring-inset ring-rule-strong outline-none focus:ring-2 focus:ring-accent"
    >
      {children}
    </select>
  )
}

export function PriorityFilter({ value, onChange }) {
  return (
    <FilterSelect value={value} onChange={onChange} label="Filter by priority">
      <option value="">Any priority</option>
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {priorityMeta(p).label}
        </option>
      ))}
    </FilterSelect>
  )
}
