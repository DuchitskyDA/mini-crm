import { Link } from 'react-router-dom'
import { STATUS_LABEL, type TaskStatus } from '../domain/tasks'
import type { Profile, Task, TaskHistoryEntry } from '../domain/types'
import { formatDate } from './ui'

const statusStyle: Record<TaskStatus, string> = {
  new: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-sky-100 text-sky-800',
  review: 'bg-amber-100 text-amber-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rework: 'bg-rose-100 text-rose-800',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function nameOf(profiles: Profile[], id: string | null): string {
  if (!id) return '—'
  return profiles.find((p) => p.id === id)?.full_name ?? 'Неизвестный пользователь'
}

export function TaskRow({ task, subtitle }: { task: Task; subtitle: string }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium break-words text-slate-900">{task.title}</span>
        <span className="block text-xs text-slate-500">{subtitle}</span>
      </span>
      <StatusBadge status={task.status} />
    </Link>
  )
}

export function TaskDetails({ task, objectName, profiles }: { task: Task; objectName: string; profiles: Profile[] }) {
  const rows: [string, string][] = [
    ['Объект', objectName],
    ['Исполнитель', nameOf(profiles, task.assignee_id)],
    ['Автор', nameOf(profiles, task.author_id)],
    ['Создана', formatDate(task.created_at)],
  ]
  return (
    <div className="space-y-3">
      {task.description ? (
        <p className="text-sm whitespace-pre-line text-slate-800">{task.description}</p>
      ) : (
        <p className="text-sm text-slate-500">Описания нет.</p>
      )}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-900 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function TaskHistory({ entries, profiles }: { entries: TaskHistoryEntry[]; profiles: Profile[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">Истории пока нет.</p>
  return (
    <ol className="space-y-3">
      {entries.map((h) => (
        <li key={h.id} className="border-l-2 border-slate-200 pl-3">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {h.from_status ? <StatusBadge status={h.from_status} /> : <span className="text-xs text-slate-500">Создана</span>}
            <span aria-hidden="true" className="text-slate-400">→</span>
            <StatusBadge status={h.to_status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {nameOf(profiles, h.actor_id)} · <span className="tabular-nums">{formatDate(h.created_at)}</span>
          </p>
          {h.comment && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-sm text-slate-700">{h.comment}</p>}
        </li>
      ))}
    </ol>
  )
}
