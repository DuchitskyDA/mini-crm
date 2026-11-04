import { describe, expect, it } from 'vitest'
import { FriendlyError, NoRowsError, OBJECT_HAS_TASKS } from '../lib/errors'
import { deleteObjectRequest, invalidateTask, keys } from './queries'

function fakeDb(result: { data: unknown[] | null; error: unknown }) {
  const chain = { delete: () => chain, eq: () => chain, select: async () => result }
  return { from: () => chain } as unknown as Parameters<typeof deleteObjectRequest>[0]
}

describe('deleteObjectRequest', () => {
  it('объект с задачами (23503) — понятная ошибка', async () => {
    const p = deleteObjectRequest(fakeDb({ data: null, error: { code: '23503', message: 'fk' } }), 'o1')
    await expect(p).rejects.toBeInstanceOf(FriendlyError)
    await expect(p).rejects.toThrow(OBJECT_HAS_TASKS)
  })
  it('2xx и 0 строк — ошибка, а не успех', async () => {
    await expect(deleteObjectRequest(fakeDb({ data: [], error: null }), 'o1')).rejects.toBeInstanceOf(NoRowsError)
  })
})

describe('invalidateTask', () => {
  it('после смены статуса обновляет задачу, историю и все списки задач', () => {
    const calls: unknown[] = []
    const qc = { invalidateQueries: (f: { queryKey: unknown }) => calls.push(f.queryKey) }
    invalidateTask(qc as unknown as Parameters<typeof invalidateTask>[0], 't1')
    expect(calls).toEqual(expect.arrayContaining([keys.task('t1'), keys.history('t1'), ['tasks']]))
  })
})
