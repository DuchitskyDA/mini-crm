import { describe, expect, it } from 'vitest'
import {
  STATUSES,
  availableActions,
  canChangeAssignee,
  canDeleteTask,
  canEditTask,
  requiredComment,
  type Role,
  type TaskStatus,
} from './tasks'

// Ожидаемые переходы — зеркало RPC change_task_status из связки (epic.md).
const expected: Record<string, TaskStatus[]> = {
  'new|executor|true': ['in_progress'],
  'in_progress|executor|true': ['review'],
  'rework|executor|true': ['in_progress'],
  // постановщик действует по роли; исполнителем задачи он быть не может (БД требует role='executor')
  'review|manager|false': ['accepted', 'rework'],
  'review|manager|true': ['accepted', 'rework'],
}

const roles: Role[] = ['manager', 'executor']

describe('availableActions', () => {
  for (const status of STATUSES)
    for (const role of roles)
      for (const isAssignee of [true, false]) {
        const want = expected[`${status}|${role}|${isAssignee}`] ?? []
        it(`${status} × ${role} × исполнитель=${isAssignee} → [${want.join(', ')}]`, () => {
          expect(availableActions(status, role, isAssignee).map((a) => a.to)).toEqual(want)
        })
      }

  it('возврат на доработку требует комментарий, остальные — нет', () => {
    const review = availableActions('review', 'manager', false)
    expect(review.find((a) => a.to === 'rework')?.requiresComment).toBe(true)
    expect(review.find((a) => a.to === 'accepted')?.requiresComment).toBe(false)
  })
})

describe('правка задачи постановщиком (docs/decisions.md)', () => {
  const cases: [TaskStatus, boolean, boolean, boolean][] = [
    // статус, правка полей, смена исполнителя, удаление
    ['new', true, true, true],
    ['in_progress', true, false, false],
    ['review', true, false, false],
    ['rework', true, true, false],
    ['accepted', false, false, false],
  ]
  for (const [status, edit, assignee, del] of cases)
    it(`${status}: правка=${edit}, исполнитель=${assignee}, удаление=${del}`, () => {
      expect(canEditTask(status)).toBe(edit)
      expect(canChangeAssignee(status)).toBe(assignee)
      expect(canDeleteTask(status)).toBe(del)
    })
})

describe('requiredComment', () => {
  it('пустой и из одних пробелов — не принимается', () => {
    expect(requiredComment('')).toBeNull()
    expect(requiredComment('   \n ')).toBeNull()
  })
  it('обрезает пробелы по краям', () => {
    expect(requiredComment('  доснять узел  ')).toBe('доснять узел')
  })
})
