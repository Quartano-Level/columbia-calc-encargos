'use client'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'
import { useState } from 'react'

export function MicrosoftLoginButton() {
  const { signInWithAzure } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    try {
      await signInWithAzure()
    } catch (error) {
      console.error('Login failed:', error)
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleLogin}
      disabled={loading}
      variant="outline"
      className="w-full"
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5"
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
          Conectando...
        </>
      ) : (
        <>
          <svg
            className="w-5 h-5 mr-2"
            viewBox="0 0 23 23"
            fill="currentColor"
          >
            <path d="M11.03.5H.5v10.53h10.53V.5z" fill="#F25022" />
            <path d="M22.5.5H11.97v10.53H22.5V.5z" fill="#7FBA00" />
            <path d="M11.03 11.97H.5V22.5h10.53V11.97z" fill="#00A4EF" />
            <path d="M22.5 11.97H11.97V22.5H22.5V11.97z" fill="#FFB900" />
          </svg>
          Entrar com Microsoft
        </>
      )}
    </Button>
  )
}
