// Сменился ли пользователь сессии: выход, вход или вход другим. Обновление токена того же
// пользователя — не смена. При смене кэш данных прошлого пользователя надо очистить.
export function sessionUserChanged(prevUserId: string | undefined, nextUserId: string | undefined): boolean {
  return prevUserId !== nextUserId
}

type SessionLike = { user: { id: string } } | null
type AuthLike<S extends SessionLike, E> = {
  getSession: () => Promise<{ data: { session: S } }>
  onAuthStateChange: (cb: (event: E, session: S) => void) => {
    data: { subscription: { unsubscribe: () => void } }
  }
}

// Следит за сессией: отдаёт текущую и каждую следующую в onChange, а при выходе или входе
// другим пользователем очищает кэш данных, чтобы прошлые данные не показались новому.
// Возвращает отписку.
export function watchSession<S extends SessionLike, E>(
  auth: AuthLike<S, E>,
  queryClient: { clear: () => void },
  onChange: (session: S) => void,
): () => void {
  let userId: string | undefined
  auth.getSession().then(({ data }) => {
    userId = data.session?.user.id
    onChange(data.session)
  })
  const { data } = auth.onAuthStateChange((_event, session) => {
    if (sessionUserChanged(userId, session?.user.id)) queryClient.clear()
    userId = session?.user.id
    onChange(session)
  })
  return () => data.subscription.unsubscribe()
}
