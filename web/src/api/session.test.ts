import { describe, expect, it } from 'vitest'
import { clearCacheOnUserChange, sessionUserChanged } from './session'

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

describe('clearCacheOnUserChange', () => {
  const fakeQc = () => {
    let cleared = 0
    return { qc: { clear: () => void cleared++ }, count: () => cleared }
  }
  it('смена пользователя — кэш очищен', () => {
    const { qc, count } = fakeQc()
    clearCacheOnUserChange(qc, 'manager', 'executor')
    expect(count()).toBe(1)
  })
  it('тот же пользователь — кэш не трогаем', () => {
    const { qc, count } = fakeQc()
    clearCacheOnUserChange(qc, 'manager', 'manager')
    expect(count()).toBe(0)
  })
})
