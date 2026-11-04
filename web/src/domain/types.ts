import type { Role, TaskStatus } from './tasks'

// Строки таблиц — контракт БД из epic.md, «Связка (волна 1)».
export type Profile = { id: string; full_name: string; role: Role }

export type CrmObject = {
  id: string
  name: string
  address: string
  created_by: string | null
  created_at: string
}

export type Task = {
  id: string
  title: string
  description: string
  object_id: string
  assignee_id: string
  status: TaskStatus
  author_id: string
  created_at: string
  updated_at: string
}

export type TaskHistoryEntry = {
  id: number
  task_id: string
  actor_id: string | null
  from_status: TaskStatus | null
  to_status: TaskStatus
  comment: string | null
  created_at: string
}
