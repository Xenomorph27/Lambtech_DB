import { useEffect, useState } from 'react'
import { Drawer } from '../ui/Drawer.jsx'
import { Button } from '../ui/Button.jsx'
import { Field, Select, TextArea, TextInput } from '../ui/Field.jsx'

/**
 * Create and edit form, driven by a declarative field list so all seven
 * entities get identical validation, layout and button behaviour.
 *
 * fields: [{ name, label, type, options, required, hint, placeholder, span }]
 *   type: text | email | tel | number | date | select | textarea
 *   options: [{ value, label }] for select
 *
 * Numbers and empty selects are normalised on save, because an <input> always
 * hands back a string and the API expects null rather than "".
 */
export function FormDrawer({
  value,
  fields,
  busy,
  onCancel,
  onSave,
  titleNew,
  titleEdit,
  subtitle,
  submitNew = 'Add',
  width = 'max-w-md',
}) {
  const [form, setForm] = useState(value ?? {})
  const [showErrors, setShowErrors] = useState(false)

  // Re-seed whenever a different record is opened.
  useEffect(() => {
    setForm(value ?? {})
    setShowErrors(false)
  }, [value])

  if (!value) return null

  const set = (name) => (event) =>
    setForm((f) => ({ ...f, [name]: event.target.value }))

  const missing = fields.filter(
    (field) => field.required && !String(form[field.name] ?? '').trim(),
  )

  function submit() {
    setShowErrors(true)
    if (missing.length > 0) return

    const payload = {}
    for (const field of fields) {
      const raw = form[field.name]
      if (field.type === 'number') {
        payload[field.name] = raw === '' || raw == null ? null : Number(raw)
      } else if (field.nullable && (raw === '' || raw == null)) {
        payload[field.name] = null
      } else {
        payload[field.name] = raw ?? null
      }
    }
    onSave(payload)
  }

  return (
    <Drawer
      open
      onClose={onCancel}
      width={width}
      title={value.id ? titleEdit : titleNew}
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving' : value.id ? 'Save changes' : submitNew}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5 p-4">
        {fields.map((field) => {
          const invalid =
            showErrors && field.required && !String(form[field.name] ?? '').trim()
          const shared = {
            value: form[field.name] ?? '',
            onChange: set(field.name),
            placeholder: field.placeholder,
            'aria-invalid': invalid || undefined,
          }
          return (
            <div key={field.name} className={field.span === 1 ? '' : 'col-span-2'}>
              <Field
                label={field.label}
                hint={field.hint}
                required={field.required}
                error={invalid ? field.label + ' is needed.' : null}
              >
                {field.type === 'select' ? (
                  <Select {...shared}>
                    {field.options.map((option) => (
                      <option key={String(option.value)} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : field.type === 'textarea' ? (
                  <TextArea rows={field.rows ?? 5} {...shared} />
                ) : (
                  <TextInput type={field.type ?? 'text'} {...shared} />
                )}
              </Field>
            </div>
          )
        })}
      </div>
    </Drawer>
  )
}

/** Shared option lists, so every form offers the same vocabulary. */
export const optionsFrom = (values, labeller) =>
  values.map((value) => ({ value, label: labeller(value) }))
