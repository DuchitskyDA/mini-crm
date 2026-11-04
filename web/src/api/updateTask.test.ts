import { describe, expect, it } from 'vitest'
import { FriendlyError, TASK_CONFLICT } from '../lib/errors'
import { updateTaskRequest } from './queries'

function fakeDb(result: { data: unknown[] | null; error: unknown }) {
  const filters: [string, unknown][] = []
  const chain = {
    update: () => chain,
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return chain
    },
    select: async () => result,
  }
  const db = { from: () => chain } as unknown as Parameters<typeof updateTaskRequest>[0]
  return { db, filters }
}

const input = { title: 'Новое название' }
const VERSION = '2026-11-04T18:42:30.483528+00:00'

describe('updateTaskRequest — защита от одновременной правки', () => {
  it('сохраняет, только если задача не менялась с открытия формы', async () => {
    const { db, filters } = fakeDb({ data: [{ id: 't1' }], error: null })
    await updateTaskRequest(db, 't1', input, VERSION)
    expect(filters).toEqual([
      ['id', 't1'],
      ['updated_at', VERSION],
    ])
  })

  it('задачу уже изменили (0 строк) — понятная ошибка конфликта', async () => {
    const { db } = fakeDb({ data: [], error: null })
    const p = updateTaskRequest(db, 't1', input, VERSION)
    await expect(p).rejects.toBeInstanceOf(FriendlyError)
    await expect(p).rejects.toThrow(TASK_CONFLICT)
  })

  it('ошибка базы пробрасывается как есть', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'Принятую задачу изменить нельзя' } })
    await expect(updateTaskRequest(db, 't1', input, VERSION)).rejects.toMatchObject({
      message: 'Принятую задачу изменить нельзя',
    })
  })

  it('успех — обновлённая задача', async () => {
    const { db } = fakeDb({ data: [{ id: 't1', title: 'Новое название' }], error: null })
    await expect(updateTaskRequest(db, 't1', input, VERSION)).resolves.toEqual({ id: 't1', title: 'Новое название' })
  })
})
