/** Small helpers for joining lists the API returns separately. */

export const byId = (rows) => Object.fromEntries((rows ?? []).map((row) => [row.id, row]))

/** Case-insensitive "any of these fields contains the needle". */
export function matches(needle, ...fields) {
  const n = needle.trim().toLowerCase()
  if (!n) return true
  return fields.filter(Boolean).some((field) => String(field).toLowerCase().includes(n))
}

/** Select options from a list of records, with an optional blank first. */
export const optionsOf = (rows, label = (row) => row.name, blank = null) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...(rows ?? []).map((row) => ({ value: row.id, label: label(row) })),
]
