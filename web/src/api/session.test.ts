import { describe, expect, it } from 'vitest'
import { sessionUserChanged, watchSession } from './session'

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

describe('watchSession — подписка на вход и выход', () => {
  type S = { user: { id: string } } | null
  function fakeAuth(initial: S) {
    let listener: (event: string, session: S) => void = () => {}
    let unsubscribed = false
    const auth = {
      getSession: async () => ({ data: { session: initial } }),
      onAuthStateChange: (cb: typeof listener) => {
        listener = cb
        return { data: { subscription: { unsubscribe: () => void (unsubscribed = true) } } }
      },
    }
    return { auth, emit: (s: S) => listener('SIGNED_IN', s), isUnsubscribed: () => unsubscribed }
  }
  const as = (id: string): S => ({ user: { id } })

  it('выход и вход другим пользователем очищают кэш, обновление токена — нет', async () => {
    const { auth, emit } = fakeAuth(as('manager'))
    let cleared = 0
    const seen: S[] = []
    watchSession(auth, { clear: () => void cleared++ }, (s) => seen.push(s))
    await Promise.resolve()
    emit(as('manager'))
    expect(cleared).toBe(0)
    emit(null)
    expect(cleared).toBe(1)
    emit(as('executor'))
    expect(cleared).toBe(2)
    expect(seen[seen.length - 1]).toEqual(as('executor'))
  })

  it('возвращает отписку', () => {
    const { auth, isUnsubscribed } = fakeAuth(null)
    watchSession(auth, { clear: () => {} }, () => {})()
    expect(isUnsubscribed()).toBe(true)
  })
})
