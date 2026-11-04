export type TaskStatus = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework'
export type Role = 'manager' | 'executor'

export type TaskAction = {
  to: TaskStatus
  label: string
  requiresComment: boolean
}

export const STATUSES: TaskStatus[] = ['new', 'in_progress', 'review', 'accepted', 'rework']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
}

type Transition = TaskAction & { from: TaskStatus; by: 'assignee' | 'manager' }

// Зеркало переходов RPC change_task_status (epic.md, «Связка»). Источник истины — БД.
const TRANSITIONS: Transition[] = [
  { from: 'new', to: 'in_progress', by: 'assignee', label: 'Взять в работу', requiresComment: false },
  { from: 'in_progress', to: 'review', by: 'assignee', label: 'Отправить на проверку', requiresComment: false },
  { from: 'review', to: 'accepted', by: 'manager', label: 'Принять', requiresComment: false },
  { from: 'review', to: 'rework', by: 'manager', label: 'Вернуть на доработку', requiresComment: true },
  { from: 'rework', to: 'in_progress', by: 'assignee', label: 'Взять в работу', requiresComment: false },
]

export function availableActions(status: TaskStatus, role: Role, isAssignee: boolean): TaskAction[] {
  return TRANSITIONS.filter((t) => t.from === status && actorMatches(t.by, role, isAssignee)).map(
    ({ to, label, requiresComment }) => ({ to, label, requiresComment }),
  )
}

function actorMatches(by: Transition['by'], role: Role, isAssignee: boolean): boolean {
  if (by === 'manager') return role === 'manager'
  return role === 'executor' && isAssignee
}

// Правила правки постановщиком — решения владельца 2026-11-04.
export function canEditTask(status: TaskStatus): boolean {
  return status !== 'accepted'
}

export function canChangeAssignee(status: TaskStatus): boolean {
  return status === 'new' || status === 'rework'
}

export function canDeleteTask(status: TaskStatus): boolean {
  return status === 'new'
}

// Комментарий к возврату на доработку: обязателен, пробелы по краям не считаются.
export function requiredComment(text: string): string | null {
  const trimmed = text.trim()
  return trimmed ? trimmed : null
}
