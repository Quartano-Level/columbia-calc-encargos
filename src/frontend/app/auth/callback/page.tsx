'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    // Supabase automatically handles the OAuth callback
    // We just need to wait for the session to be established
    const checkSession = async () => {
      try {
        // Small delay to allow Supabase to process the callback
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('❌ Session error:', error.message)
          router.push('/?error=' + encodeURIComponent(error.message))
          return
        }

        if (session) {
          console.log('✅ Authentication successful:', session.user.email)
          router.push('/')
        } else {
          console.error('❌ No session found')
          router.push('/?error=authentication_failed')
        }
      } catch (err) {
        console.error('❌ Callback error:', err)
        router.push('/?error=unexpected_error')
      }
    }

    checkSession()
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <svg
          className="animate-spin h-12 w-12 mx-auto mb-4 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <p className="text-lg">Autenticando...</p>
      </div>
    </div>
  )
}
