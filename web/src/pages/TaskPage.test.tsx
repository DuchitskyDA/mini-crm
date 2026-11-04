// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { CrmObject, Profile, Task } from '../domain/types'
import { TaskView } from './TaskPage'

afterEach(cleanup)

const manager: Profile = { id: 'm1', full_name: 'Анна Смирнова', role: 'manager' }
const executor: Profile = { id: 'e1', full_name: 'Иван Петров', role: 'executor' }
const object: CrmObject = { id: 'o1', name: 'ЖК «Северный»', address: 'ул. Северная, 12', created_by: 'm1', created_at: '2026-11-01T10:00:00Z' }
const taskAt = (updated_at: string, title = 'Монтаж кровли'): Task => ({
  id: 't1',
  title,
  description: '',
  object_id: 'o1',
  assignee_id: 'e1',
  status: 'new',
  author_id: 'm1',
  created_at: '2026-11-01T10:00:00Z',
  updated_at,
})

function view(task: Task, onUpdate: (input: unknown, version: string) => Promise<unknown>) {
  return (
    <MemoryRouter>
      <TaskView
        profile={manager}
        task={task}
        objectName={object.name}
        profiles={[manager, executor]}
        objects={[object]}
        history={[]}
        loading={false}
        error={null}
        onRetry={() => {}}
        onChangeStatus={async () => {}}
        onUpdate={onUpdate}
        onDelete={async () => {}}
      />
    </MemoryRouter>
  )
}

describe('правка задачи — версия для сверки', () => {
  it('берётся на момент открытия формы, даже если данные обновились, пока форма открыта', async () => {
    const onUpdate = vi.fn(async () => {})
    const { rerender } = render(view(taskAt('V1'), onUpdate))
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    rerender(view(taskAt('V2', 'Чужая правка'), onUpdate))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledWith(expect.anything(), 'V1')
  })
})
