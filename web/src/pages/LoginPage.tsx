import { Navigate } from 'react-router-dom'
import { signIn, useAuth } from '../api/auth'
import { LoginForm } from '../components/forms'
import { Card } from '../components/ui'
import { useAction } from '../lib/useAction'

export function LoginView({ onSignIn, initialError }: { onSignIn: (email: string, password: string) => Promise<unknown>; initialError?: string }) {
  const action = useAction()
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Объекты и задачи</h1>
        <Card className="p-5">
          <LoginForm
            pending={action.pending}
            error={action.error ?? initialError}
            onSubmit={(email, password) => void action.run(() => onSignIn(email, password))}
          />
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { session } = useAuth()
  if (session) return <Navigate to="/" replace />
  return <LoginView onSignIn={signIn} />
}
