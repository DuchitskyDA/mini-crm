import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configError =
  !url || !anonKey ? 'Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. web/.env.example)' : null

// Во фронт попадает только URL и anon-ключ; права режет RLS в базе.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing')
