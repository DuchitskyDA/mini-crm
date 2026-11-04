// Сменился ли пользователь сессии: выход, вход или вход другим. Обновление токена того же
// пользователя — не смена. При смене кэш данных прошлого пользователя надо очистить.
export function sessionUserChanged(prevUserId: string | undefined, nextUserId: string | undefined): boolean {
  return prevUserId !== nextUserId
}

// Данные прошлого пользователя не должны остаться в кэше после выхода или входа другим.
export function clearCacheOnUserChange(
  queryClient: { clear: () => void },
  prevUserId: string | undefined,
  nextUserId: string | undefined,
): void {
  if (sessionUserChanged(prevUserId, nextUserId)) queryClient.clear()
}
