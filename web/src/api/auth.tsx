import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from '../domain/types'
import { supabase } from '../lib/supabase'
import { watchSession } from './session'

type AuthState = { session: Session | null; ready: boolean }

const AuthContext = createContext<AuthState>({ session: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false })
  const queryClient = useQueryClient()

  useEffect(
    () => watchSession(supabase.auth, queryClient, (session) => setState({ session, ready: true })),
    [queryClient],
  )

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
