import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isBypass = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'

  if ((!supabaseUrl || !supabaseAnonKey) && !isBypass) {
    throw new Error('Missing Supabase environment variables')
  }

  // Use dummy values if bypass is on and vars are missing
  const url = supabaseUrl || 'http://localhost:54321'
  const key = supabaseAnonKey || 'dummy-key'

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: 'supabase.auth.token',
      debug: process.env.NODE_ENV === 'development'
    }
  })

  return supabaseInstance
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseClient() as unknown as Record<string | symbol, unknown>)[prop]
  }
})
