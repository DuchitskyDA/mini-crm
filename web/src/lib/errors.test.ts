import { describe, expect, it } from 'vitest'
import { NoRowsError, errorText, requireRows } from './errors'

describe('requireRows', () => {
  it('пустой ответ (строку отсёк RLS) — ошибка, а не успех', () => {
    expect(() => requireRows([])).toThrow(NoRowsError)
    expect(() => requireRows(null)).toThrow(NoRowsError)
  })
  it('строки есть — возвращает их', () => {
    expect(requireRows([{ id: '1' }])).toEqual([{ id: '1' }])
  })
})

describe('errorText', () => {
  it('русский текст ошибки базы показывается как есть, даже с кодом 42501', () => {
    expect(errorText({ code: '42501', message: 'Нет доступа' })).toBe('Нет доступа')
  })
  it('технический английский текст заменяется понятным', () => {
    expect(errorText({ code: '42501', message: 'permission denied for table tasks' })).toBe('Недостаточно прав для этого действия.')
  })
})
