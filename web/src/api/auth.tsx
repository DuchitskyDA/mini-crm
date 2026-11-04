import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from '../domain/types'
import { supabase } from '../lib/supabase'
import { clearCacheOnUserChange } from './session'

type AuthState = { session: Session | null; ready: boolean }

const AuthContext = createContext<AuthState>({ session: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false })
  const queryClient = useQueryClient()

  useEffect(() => {
    let userId: string | undefined
    supabase.auth.getSession().then(({ data }) => {
      userId = data.session?.user.id
      setState({ session: data.session, ready: true })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Данные прошлого пользователя не должны остаться в кэше после выхода или смены входа.
      clearCacheOnUserChange(queryClient, userId, session?.user.id)
      userId = session?.user.id
      setState({ session, ready: true })
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

export function useMyProfile() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['me', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}
