import { describe, expect, it } from 'vitest'
import { NoRowsError } from '../lib/errors'
import { deleteTaskRequest } from './queries'

// Минимальная подделка цепочки supabase.from().delete().eq().select().
function fakeDb(result: { data: unknown[] | null; error: unknown }) {
  const chain = { delete: () => chain, eq: () => chain, select: async () => result }
  return { from: () => chain } as unknown as Parameters<typeof deleteTaskRequest>[0]
}

describe('deleteTaskRequest', () => {
  it('2xx и 0 строк (RLS не дал удалить) — ошибка, а не успех', async () => {
    await expect(deleteTaskRequest(fakeDb({ data: [], error: null }), 't1')).rejects.toBeInstanceOf(NoRowsError)
  })
  it('строка удалена — успех', async () => {
    await expect(deleteTaskRequest(fakeDb({ data: [{ id: 't1' }], error: null }), 't1')).resolves.toBeUndefined()
  })
})
