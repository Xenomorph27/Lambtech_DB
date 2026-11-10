import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LoadingRows } from '../ui/Spinner.jsx'
import { ErrorState } from '../ui/EmptyState.jsx'

/**
 * The one table in the app. Five screens use it, so sorting, density, empty,
 * loading and error behaviour are defined once here rather than five times.
 *
 * Columns: { key, header, width, align, render(row), sortValue(row), mono }
 * `sortValue` lets a column sort by something other than what it displays,
 * which is how "Priority" sorts by rank rather than alphabetically.
 */
export function DataTable({
  columns,
  rows,
  loading,
  error,
  onRetry,
  onRowClick,
  activeId,
  empty,
  initialSort,
  rowKey = (row) => row.id,
}) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? []
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return rows
    const valueOf = column.sortValue ?? ((row) => row[column.key])
    const direction = sort.dir === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      const av = valueOf(a)
      const bv = valueOf(b)
      // Blanks always sink, whichever way the column is sorted.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * direction
    })
  }, [rows, sort, columns])

  const toggleSort = (key) =>
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )

  if (error) return <ErrorState error={error} onRetry={onRetry} />

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* table-fixed makes the declared column widths authoritative. With auto
          layout the browser re-apportions by content, which starved the Email
          column to 159px while Organisation took 271px. */}
      <table className="w-full table-fixed border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key
              const sortable = column.sortable !== false
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={
                    'surface-screen hover-column border-b border-rule px-3 py-2 text-xs ' +
                    'font-medium transition-colors ' +
                    (active ? 'text-ink ' : 'text-ink-3 ') +
                    (column.align === 'right' ? 'text-right ' : '')
                  }
                  style={{
                    ...(column.width ? { width: column.width } : null),
                    // The sorted column is underlined in the screen's hue.
                    ...(active ? { boxShadow: 'inset 0 -2px 0 0 var(--screen)' } : null),
                  }}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={
                        'inline-flex items-center gap-1 rounded-sm hover:text-ink ' +
                        (active ? 'text-ink' : '')
                      }
                    >
                      {column.header}
                      {active &&
                        (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        {loading ? (
          <LoadingRows cols={columns.length} />
        ) : (
          <tbody>
            {sorted.map((row) => {
              const id = rowKey(row)
              const selected = activeId != null && String(activeId) === String(id)
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                  className={
                    'border-b border-rule/60 transition-colors ' +
                    (onRowClick ? 'cursor-pointer ' : '') +
                    // Hover and selection both carry the screen's hue, so the
                    // pointer belongs to the screen you are on rather than
                    // being the same grey everywhere.
                    (selected ? 'selected-screen ' : 'hover-screen ')
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={
                        // Rows never wrap. One wrapped cell silently doubles the
                        // height of every row in the table, which is the fastest
                        // way to lose the density this screen depends on.
                        // Overflow is clipped with an ellipsis instead.
                        'overflow-hidden text-ellipsis whitespace-nowrap ' +
                        'border-b border-rule/50 px-3 py-[7px] align-middle ' +
                        (column.align === 'right' ? 'text-right ' : '') +
                        (column.mono ? 'tnum ' : '')
                      }
                    >
                      {column.render ? column.render(row) : (row[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        )}
      </table>

      {!loading && sorted.length === 0 && empty}
    </div>
  )
}
