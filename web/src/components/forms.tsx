import { useState, type FormEvent } from 'react'
import type { CrmObject, Profile } from '../domain/types'
import { Button, ErrorBox, Field, Select, TextArea, TextInput } from './ui'

export function LoginForm({ onSubmit, pending, error }: { onSubmit: (email: string, password: string) => void; pending?: boolean; error?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(email.trim(), password)
      }}
    >
      <Field label="Email">
        <TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Пароль">
        <TextInput type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <ErrorBox message={error} />}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </Button>
    </form>
  )
}

type ObjectFormProps = {
  initial?: Pick<CrmObject, 'name' | 'address'>
  submitLabel: string
  pending?: boolean
  error?: string
  onSubmit: (input: { name: string; address: string }) => void
  onCancel?: () => void
}

export function ObjectForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: ObjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [touched, setTouched] = useState(false)
  const invalid = !name.trim() || !address.trim()

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!invalid) onSubmit({ name: name.trim(), address: address.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Название" error={touched && !name.trim() ? 'Укажите название' : undefined}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="ЖК «Северный», корпус 2" />
      </Field>
      <Field label="Адрес" error={touched && !address.trim() ? 'Укажите адрес' : undefined}>
        <TextInput value={address} onChange={(e) => setAddress(e.target.value)} placeholder="г. Казань, ул. Строителей, 12" />
      </Field>
      {error && <ErrorBox message={error} />}
      <FormButtons submitLabel={submitLabel} pending={pending} onCancel={onCancel} />
    </form>
  )
}

export type TaskFormValues = { title: string; description: string; object_id: string; assignee_id: string }

type TaskFormProps = {
  initial: TaskFormValues
  objects: CrmObject[]
  executors: Profile[]
  canChangeAssignee: boolean
  submitLabel: string
  pending?: boolean
  error?: string
  onSubmit: (values: TaskFormValues) => void
  onCancel?: () => void
}

export function TaskForm({ initial, objects, executors, canChangeAssignee, submitLabel, pending, error, onSubmit, onCancel }: TaskFormProps) {
  const [v, setV] = useState(initial)
  const [touched, setTouched] = useState(false)
  const set = (patch: Partial<TaskFormValues>) => setV((prev) => ({ ...prev, ...patch }))
  const missing = {
    title: !v.title.trim(),
    object: !v.object_id,
    assignee: !v.assignee_id,
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (missing.title || missing.object || missing.assignee) return
    onSubmit({ ...v, title: v.title.trim(), description: v.description.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Название" error={touched && missing.title ? 'Укажите название' : undefined}>
        <TextInput value={v.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Описание">
        <TextArea value={v.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Объект" error={touched && missing.object ? 'Выберите объект' : undefined}>
        <Select value={v.object_id} onChange={(e) => set({ object_id: e.target.value })}>
          <option value="">— выберите —</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Исполнитель"
        error={touched && missing.assignee ? 'Выберите исполнителя' : undefined}
        hint={canChangeAssignee ? undefined : 'Сменить исполнителя можно только в статусах «Новая» и «На доработке».'}
      >
        <Select value={v.assignee_id} disabled={!canChangeAssignee} onChange={(e) => set({ assignee_id: e.target.value })}>
          <option value="">— выберите —</option>
          {executors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </Select>
      </Field>
      {error && <ErrorBox message={error} />}
      <FormButtons submitLabel={submitLabel} pending={pending} onCancel={onCancel} />
    </form>
  )
}

function FormButtons({ submitLabel, pending, onCancel }: { submitLabel: string; pending?: boolean; onCancel?: () => void }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="submit" disabled={pending}>
        {pending ? 'Сохраняем…' : submitLabel}
      </Button>
      {onCancel && (
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
      )}
    </div>
  )
}
