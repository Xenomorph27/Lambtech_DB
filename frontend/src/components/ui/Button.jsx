const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-control font-medium ' +
  'transition-colors disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap'

const VARIANTS = {
  // Blue means actionable, and appears nowhere in the status ramps.
  primary: 'lift bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-raised text-ink ring-1 ring-inset ring-rule-strong hover:bg-raised-2',
  ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
  danger: 'bg-heat-1 text-white hover:brightness-110',
  dangerGhost: 'text-heat-2 hover:bg-heat-1/12',
}

const SIZES = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-9 px-4 text-sm',
  icon: 'h-7 w-7',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={[BASE, VARIANTS[variant], SIZES[size], className].join(' ')}
      {...props}
    />
  )
}
