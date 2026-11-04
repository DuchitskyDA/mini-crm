import { describe, expect, it } from 'vitest'
import { changeStatusCall, changeStatusRequest } from './rpc'

describe('changeStatusCall', () => {
  it('вызывает change_task_status с параметрами контракта', () => {
    expect(changeStatusCall('t1', 'rework', '  нет фото  ')).toEqual([
      'change_task_status',
      { p_task_id: 't1', p_to: 'rework', p_comment: 'нет фото' },
    ])
  })

  it('без комментария передаёт null', () => {
    expect(changeStatusCall('t1', 'in_progress')).toEqual(['change_task_status', { p_task_id: 't1', p_to: 'in_progress', p_comment: null }])
    expect(changeStatusCall('t1', 'review', '   ')[1].p_comment).toBeNull()
  })
})

describe('changeStatusRequest', () => {
  const fakeDb = (result: { data: unknown; error: unknown }) =>
    ({ rpc: async () => result }) as unknown as Parameters<typeof changeStatusRequest>[0]

  it('отказ базы — ошибка с её текстом, а не успех', async () => {
    const db = fakeDb({ data: null, error: { message: 'Этот переход статуса недоступен' } })
    await expect(changeStatusRequest(db, 't1', 'accepted')).rejects.toMatchObject({ message: 'Этот переход статуса недоступен' })
  })
  it('успех — обновлённая задача', async () => {
    const task = { id: 't1', status: 'review' }
    await expect(changeStatusRequest(fakeDb({ data: task, error: null }), 't1', 'review')).resolves.toEqual(task)
  })
})
