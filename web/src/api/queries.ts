import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { TaskStatus } from '../domain/tasks'
import type { CrmObject, Profile, Task, TaskHistoryEntry } from '../domain/types'
import { FriendlyError, OBJECT_HAS_TASKS, TaskConflictError, requireRows } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { changeStatusRequest } from './rpc'

const TASK_FIELDS = 'id, title, description, object_id, assignee_id, status, author_id, created_at, updated_at'

export const keys = {
  profiles: ['profiles'] as const,
  objects: ['objects'] as const,
  object: (id: string) => ['object', id] as const,
  objectTasks: (id: string) => ['tasks', 'object', id] as const,
  myTasks: (userId: string) => ['tasks', 'mine', userId] as const,
  task: (id: string) => ['task', id] as const,
  history: (taskId: string) => ['history', taskId] as const,
}

// Профили читаются списком и сопоставляются на клиенте: у actor_id истории нет FK,
// а имена FK задач (assignee, author) — деталь миграций.
export function useProfiles() {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name')
      if (error) throw error
      return data as Profile[]
    },
  })
}

export function useObjects(enabled = true) {
  return useQuery({
    queryKey: keys.objects,
    enabled,
    queryFn: async (): Promise<CrmObject[]> => {
      const { data, error } = await supabase.from('objects').select('*').order('name')
      if (error) throw error
      return data as CrmObject[]
    },
  })
}

export function useObject(id: string, enabled = true) {
  return useQuery({
    queryKey: keys.object(id),
    enabled,
    queryFn: async (): Promise<CrmObject | null> => {
      const { data, error } = await supabase.from('objects').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data as CrmObject | null
    },
  })
}

// Исполнитель получит только свои задачи объекта — так режет RLS.
export function useObjectTasks(objectId: string) {
  return useQuery({
    queryKey: keys.objectTasks(objectId),
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_FIELDS)
        .eq('object_id', objectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Task[]
    },
  })
}

export function useMyTasks(userId: string) {
  return useQuery({
    queryKey: keys.myTasks(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_FIELDS)
        .eq('assignee_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as Task[]
    },
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: keys.task(id),
    queryFn: async (): Promise<Task | null> => {
      const { data, error } = await supabase.from('tasks').select(TASK_FIELDS).eq('id', id).maybeSingle()
      if (error) throw error
      return data as Task | null
    },
  })
}

export function useTaskHistory(taskId: string) {
  return useQuery({
    queryKey: keys.history(taskId),
    queryFn: async (): Promise<TaskHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('task_history')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw error
      return data as TaskHistoryEntry[]
    },
  })
}

export type ObjectInput = { name: string; address: string }

export function useSaveObject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ObjectInput }): Promise<CrmObject> => {
      const query = id
        ? supabase.from('objects').update(input).eq('id', id)
        : supabase.from('objects').insert(input)
      const { data, error } = await query.select('*')
      if (error) throw error
      return requireRows(data)[0] as CrmObject
    },
    onSuccess: (obj) => {
      qc.invalidateQueries({ queryKey: keys.objects })
      qc.invalidateQueries({ queryKey: keys.object(obj.id) })
    },
  })
}

// Объект с задачами не удаляется (FK RESTRICT → 23503); 0 строк — RLS отсёк удаление.
export async function deleteObjectRequest(db: Pick<typeof supabase, 'from'>, id: string): Promise<void> {
  const { data, error } = await db.from('objects').delete().eq('id', id).select('id')
  if ((error as { code?: string } | null)?.code === '23503') throw new FriendlyError(OBJECT_HAS_TASKS)
  if (error) throw error
  requireRows(data)
}

export function useDeleteObject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteObjectRequest(supabase, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.objects }),
  })
}

// status, author_id, created_at не отправляются: их ставит БД (триггер BEFORE INSERT).
export type TaskInput = { title: string; description: string; object_id: string; assignee_id: string }

export function invalidateTask(qc: QueryClient, taskId: string) {
  qc.invalidateQueries({ queryKey: keys.task(taskId) })
  qc.invalidateQueries({ queryKey: keys.history(taskId) })
  qc.invalidateQueries({ queryKey: ['tasks'] })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TaskInput): Promise<Task> => {
      const { data, error } = await supabase.from('tasks').insert(input).select(TASK_FIELDS)
      if (error) throw error
      return requireRows(data)[0] as Task
    },
    onSuccess: (task) => invalidateTask(qc, task.id),
  })
}

// Оптимистичная блокировка: сохраняем, только если updated_at задачи тот же, что при открытии формы.
// Иначе задачу успели изменить (другой постановщик или смена статуса) — 0 строк, ошибка конфликта.
export async function updateTaskRequest(
  db: Pick<typeof supabase, 'from'>,
  id: string,
  input: Partial<TaskInput>,
  version: string,
): Promise<Task> {
  const { data, error } = await db.from('tasks').update(input).eq('id', id).eq('updated_at', version).select(TASK_FIELDS)
  if (error) throw error
  if (!data?.length) throw new TaskConflictError()
  return data[0] as Task
}

// Сохранение правки. При конфликте сначала дожидаемся свежей версии задачи и только потом
// сообщаем об ошибке: тогда закрыть и снова открыть форму можно сразу — она возьмёт новую версию.
export async function saveTaskEdit(
  db: Pick<typeof supabase, 'from'>,
  qc: { refetchQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown> },
  id: string,
  input: Partial<TaskInput>,
  version: string,
): Promise<Task> {
  try {
    return await updateTaskRequest(db, id, input, version)
  } catch (error) {
    if (error instanceof TaskConflictError) await qc.refetchQueries({ queryKey: keys.task(id) })
    throw error
  }
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input, version }: { id: string; input: Partial<TaskInput>; version: string }) =>
      saveTaskEdit(supabase, qc, id, input, version),
    // И после ошибки: списки и история тоже должны показать актуальное состояние.
    onSettled: (_data, _error, vars) => invalidateTask(qc, vars.id),
  })
}

// Удаление задачи не в «Новая» RLS отсекает молча: 2xx и 0 строк — это отказ, а не успех.
export async function deleteTaskRequest(db: Pick<typeof supabase, 'from'>, id: string): Promise<void> {
  const { data, error } = await db.from('tasks').delete().eq('id', id).select('id')
  if (error) throw error
  requireRows(data)
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTaskRequest(supabase, id),
    onSuccess: (_data, id) => {
      // Убираем задачу из списков сразу, чтобы после возврата на объект она не мелькала до перезапроса.
      qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (list) => list?.filter((t) => t.id !== id))
      qc.removeQueries({ queryKey: keys.task(id) })
      invalidateTask(qc, id)
    },
  })
}

// Смена статуса — только через RPC; БД проверяет переход, роль и комментарий.
export function useChangeStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, to, comment }: { taskId: string; to: TaskStatus; comment?: string }) =>
      (await changeStatusRequest(supabase, taskId, to, comment)) as Task,
    onSettled: (_data, _error, vars) => invalidateTask(qc, vars.taskId),
  })
}
