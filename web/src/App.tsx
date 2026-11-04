import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Outlet, Route, Routes, useOutletContext } from 'react-router-dom'
import { AuthProvider, signOut, useAuth, useMyProfile } from './api/auth'
import { Shell } from './components/layout'
import { Button, ErrorBox, ListSkeleton } from './components/ui'
import type { Profile } from './domain/types'
import { errorText } from './lib/errors'
import { configError } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import MyTasksPage from './pages/MyTasksPage'
import ObjectPage from './pages/ObjectPage'
import ObjectsPage from './pages/ObjectsPage'
import TaskPage from './pages/TaskPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-16">{children}</div>
}

// Вход обязателен; без профиля в базе — экран «нет доступа» (RLS всё равно ничего не отдаст).
function RequireProfile() {
  const { session, ready } = useAuth()
  const me = useMyProfile()
  if (!ready) return <Centered><ListSkeleton rows={2} /></Centered>
  if (!session) return <Navigate to="/login" replace />
  if (me.isPending) return <Centered><ListSkeleton rows={2} /></Centered>
  if (me.error)
    return (
      <Centered>
        <ErrorBox message={`Не удалось загрузить профиль: ${errorText(me.error)}`} onRetry={() => me.refetch()} />
      </Centered>
    )
  if (!me.data)
    return (
      <Centered>
        <h1 className="mb-2 text-xl font-semibold">Нет доступа</h1>
        <p className="mb-4 text-sm text-slate-600">Для этой учётной записи не заведён профиль сотрудника.</p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Выйти
        </Button>
      </Centered>
    )
  return (
    <Shell profile={me.data} onSignOut={() => void signOut()}>
      <Outlet context={{ profile: me.data }} />
    </Shell>
  )
}

function Home() {
  const { profile } = useOutletContext<{ profile: Profile }>()
  return <Navigate to={profile.role === 'executor' ? '/my' : '/objects'} replace />
}

function ExecutorOnly() {
  const ctx = useOutletContext<{ profile: Profile }>()
  if (ctx.profile.role !== 'executor') return <Navigate to="/objects" replace />
  return <Outlet context={ctx} />
}

export default function App() {
  if (configError)
    return (
      <Centered>
        <ErrorBox message={configError} />
      </Centered>
    )
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireProfile />}>
              <Route index element={<Home />} />
              <Route path="/objects" element={<ObjectsPage />} />
              <Route path="/objects/:id" element={<ObjectPage />} />
              <Route path="/tasks/:id" element={<TaskPage />} />
              <Route element={<ExecutorOnly />}>
                <Route path="/my" element={<MyTasksPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
