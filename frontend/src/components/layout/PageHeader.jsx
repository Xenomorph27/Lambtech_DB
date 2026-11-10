/**
 * Screen title with its live count and the primary action for that screen.
 * The count belongs here because knowing the size of the set is part of
 * reading the screen.
 */
export function PageHeader({ title, count, description, actions }) {
  return (
    <div className="shrink-0">
      <header className="header-screen flex h-11 items-center gap-3 border-b px-4 transition-colors duration-200">
        <h1 className="text-base font-medium tracking-tight text-ink">{title}</h1>
        {count != null && (
          <span
            className="tnum rounded-control px-1.5 py-0.5 text-xs text-ink"
            style={{ backgroundColor: 'color-mix(in oklab, var(--screen) 22%, transparent)' }}
          >
            {count}
          </span>
        )}
        {description && (
          <p className="hidden truncate text-xs text-ink-3 md:block">{description}</p>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      {/* The one place the screen's hue is stated at full strength. */}
      <div className="rule-screen h-[2px] w-full transition-colors duration-200" />
    </div>
  )
}

/** Full-height screen scaffold: header, then a scrolling panel below it. */
export function Screen({ children }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>
}

export function Panel({ children, className = '' }) {
  return (
    <div
      className={
        'surface-screen glow-screen flex min-h-0 flex-1 flex-col ' +
        'transition-colors duration-200 ' +
        className
      }
    >
      {children}
    </div>
  )
}
