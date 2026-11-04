// Сменился ли пользователь сессии: выход, вход или вход другим. Обновление токена того же
// пользователя — не смена. При смене кэш данных прошлого пользователя надо очистить.
export function sessionUserChanged(prevUserId: string | undefined, nextUserId: string | undefined): boolean {
  return prevUserId !== nextUserId
}
