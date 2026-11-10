import { useId } from 'react'

const CONTROL =
  'w-full rounded-control bg-ground text-ink placeholder:text-ink-3 ' +
  'ring-1 ring-inset ring-rule-strong h-8 px-2.5 text-sm ' +
  'focus:ring-accent focus:ring-2 outline-none transition-shadow'

export function Field({ label, hint, error, children, required }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink-2">
          {label}
          {required && <span className="ml-0.5 text-heat-2">*</span>}
        </span>
        {hint && <span className="text-2xs text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-heat-2">{error}</span>}
    </label>
  )
}

export function TextInput({ className = '', ...props }) {
  return <input className={CONTROL + ' ' + className} {...props} />
}

export function TextArea({ className = '', rows = 4, ...props }) {
  return (
    <textarea
      rows={rows}
      className={CONTROL + ' h-auto py-2 leading-relaxed ' + className}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={CONTROL + ' pr-7 ' + className} {...props}>
      {children}
    </select>
  )
}

/** Label plus control in one call, for the many single-line form fields. */
export function TextField({ label, hint, error, required, ...inputProps }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <TextInput id={id} required={required} {...inputProps} />
    </Field>
  )
}
