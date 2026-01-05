'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'

const MOCK_USER: User = {
  id: 'dev-user-123',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'dev@localhost.com',
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'dev', providers: ['dev'] },
  user_metadata: { name: 'Dev User', full_name: 'Development User' },
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const MOCK_SESSION: Session = {
  access_token: 'dev-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'dev-refresh-token',
  user: MOCK_USER,
}

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithAzure: () => Promise<void>
  signOut: () => Promise<void>
  isDevMode: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signInWithAzure: async () => { },
  signOut: async () => { },
  isDevMode: false,
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (DEV_AUTH_BYPASS) {
      console.log('🔓 DEV MODE: Authentication bypassed')
      setUser(MOCK_USER)
      setSession(MOCK_SESSION)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithAzure = async () => {
    if (DEV_AUTH_BYPASS) {
      console.log('🔓 DEV MODE: Auto sign-in')
      setUser(MOCK_USER)
      setSession(MOCK_SESSION)
      return
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email profile openid',
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (error) {
      console.error('Error signing in with Azure:', error)
      throw error
    }
  }

  const signOut = async () => {
    if (DEV_AUTH_BYPASS) {
      console.log('🔓 DEV MODE: Sign out (clearing mock session)')
      setUser(null)
      setSession(null)
      return
    }

    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  const value = {
    user,
    session,
    loading,
    signInWithAzure,
    signOut,
    isDevMode: DEV_AUTH_BYPASS,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
