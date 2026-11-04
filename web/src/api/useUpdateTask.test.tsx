// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TASK_CONFLICT } from '../lib/errors'
import { keys, useUpdateTask } from './queries'

// Сеть подменяем: UPDATE задачи возвращает 0 строк — задачу уже изменили.
vi.mock('../lib/supabase', () => {
  const chain = { update: () => chain, eq: () => chain, select: async () => ({ data: [], error: null }) }
  return { supabase: { from: () => chain } }
})

describe('useUpdateTask — подключение защиты от конфликта', () => {
  it('при конфликте перезапрашивает задачу до того, как отдать ошибку', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const refetch = vi.spyOn(qc, 'refetchQueries').mockResolvedValue()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useUpdateTask(), { wrapper })

    await expect(result.current.mutateAsync({ id: 't1', input: { title: 'Новое' }, version: 'V1' })).rejects.toThrow(TASK_CONFLICT)
    expect(refetch).toHaveBeenCalledWith({ queryKey: keys.task('t1') })
  })
})
