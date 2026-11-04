import { useState } from 'react'
import { errorText } from './errors'

// Запуск асинхронного действия с флагом ожидания и понятным текстом ошибки.
export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setPending(true)
    setError(undefined)
    try {
      await fn()
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    } finally {
      setPending(false)
    }
  }

  return { pending, error, run, reset: () => setError(undefined), setError }
}
