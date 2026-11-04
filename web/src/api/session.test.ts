import { describe, expect, it } from 'vitest'
import { sessionUserChanged } from './session'

describe('sessionUserChanged — когда очищать кэш данных', () => {
  it('выход или вход другим пользователем — очищать', () => {
    expect(sessionUserChanged('manager', 'executor')).toBe(true)
    expect(sessionUserChanged('manager', undefined)).toBe(true)
    expect(sessionUserChanged(undefined, 'executor')).toBe(true)
  })
  it('обновление токена того же пользователя — не очищать', () => {
    expect(sessionUserChanged('manager', 'manager')).toBe(false)
    expect(sessionUserChanged(undefined, undefined)).toBe(false)
  })
})
