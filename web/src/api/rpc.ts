import type { SupabaseClient } from '@supabase/supabase-js'
import { requiredComment, type TaskStatus } from '../domain/tasks'

// Вызов RPC смены статуса — контракт БД из epic.md: change_task_status(p_task_id, p_to, p_comment).
export function changeStatusCall(taskId: string, to: TaskStatus, comment?: string): [string, Record<string, unknown>] {
  return ['change_task_status', { p_task_id: taskId, p_to: to, p_comment: requiredComment(comment ?? '') }]
}

// Смена статуса через RPC. Отказ базы (запрещённый переход, нет комментария, чужая задача)
// пробрасывается ошибкой с её текстом, чтобы интерфейс показал причину.
export async function changeStatusRequest(
  db: Pick<SupabaseClient, 'rpc'>,
  taskId: string,
  to: TaskStatus,
  comment?: string,
): Promise<unknown> {
  const [fn, args] = changeStatusCall(taskId, to, comment)
  const { data, error } = await db.rpc(fn, args)
  if (error) throw error
  return data
}
