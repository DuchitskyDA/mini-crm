import { requiredComment, type TaskStatus } from '../domain/tasks'

// Вызов RPC смены статуса — контракт БД из epic.md: change_task_status(p_task_id, p_to, p_comment).
export function changeStatusCall(taskId: string, to: TaskStatus, comment?: string): [string, Record<string, unknown>] {
  return ['change_task_status', { p_task_id: taskId, p_to: to, p_comment: requiredComment(comment ?? '') }]
}
