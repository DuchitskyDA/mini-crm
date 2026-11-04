type ErrorLike = { code?: string; message?: string }

// Ошибка с уже готовым текстом для пользователя.
export class FriendlyError extends Error {}

// UPDATE/DELETE, отсечённые RLS, не дают ошибки — возвращают 0 строк.
export class NoRowsError extends FriendlyError {
  constructor() {
    super('Изменение не выполнено: нет прав или запись уже изменилась. Обновите страницу.')
  }
}

// Задачу изменили после открытия формы — сохранение отклонено.
export class TaskConflictError extends FriendlyError {
  constructor() {
    super(TASK_CONFLICT)
  }
}

// Правка задачи не прошла: её изменили после открытия формы (другой постановщик или смена статуса).
export const TASK_CONFLICT =
  'Задачу уже изменил другой пользователь. Закройте окно — данные обновятся — и внесите правки заново.'

export const OBJECT_HAS_TASKS =
  'У объекта есть задачи — удалить его нельзя. Сначала удалите или перенесите задачи.'

// Переводит ошибки Supabase (PostgREST, RPC, Auth) в текст для пользователя.
export function errorText(error: unknown): string {
  if (error instanceof FriendlyError) return error.message
  const e = (error ?? {}) as ErrorLike
  // Ошибки RPC и триггеров база пишет по-русски — их показываем как есть.
  if (e.message && /[А-Яа-яЁё]/.test(e.message)) return e.message
  if (e.code === '23503') return 'Запись связана с другими данными — действие невозможно.'
  if (e.code === '42501') return 'Недостаточно прав для этого действия.'
  if (e.message === 'Invalid login credentials') return 'Неверный email или пароль.'
  if (e.message) return e.message
  return 'Не удалось выполнить действие.'
}

// Ответ UPDATE/DELETE с .select(): пустой массив значит, что RLS отсёк строку.
export function requireRows<T>(data: T[] | null): T[] {
  if (!data?.length) throw new NoRowsError()
  return data
}
