import { describe, expect, it } from 'vitest'
import { changeStatusCall } from './rpc'

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
