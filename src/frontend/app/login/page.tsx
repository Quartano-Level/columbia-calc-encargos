'use client'

import { useAuth } from '@/components/auth-provider'
import { MicrosoftLoginButton } from '@/components/microsoft-login-button'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const { user, loading, isDevMode, signInWithAzure } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Se o usuário já está logado, redireciona para a home
    if (user && !loading) {
      router.push('/')
    }
  }, [user, loading, router])

  const handleDevLogin = async () => {
    // A função signInWithAzure já faz o bypass se isDevMode for true
    await signInWithAzure()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
      </div>
    )
  }

  // Se já está logado, não mostra nada (vai redirecionar)
  if (user) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Finance Calculator
          </CardTitle>
          <CardDescription className="text-base">
            Entre com sua conta Microsoft para continuar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <MicrosoftLoginButton />
          </div>

          {isDevMode && (
            <div className="pt-2 border-t border-dashed border-gray-200 mt-4">
              <button
                onClick={handleDevLogin}
                className="w-full py-2 px-4 bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-medium rounded-lg border border-orange-200 transition-colors"
              >
                🔓 Acessar como Desenvolvedor (Bypass)
              </button>
            </div>
          )}

          <div className="text-xs text-center text-muted-foreground pt-2">
            Ao entrar, você concorda com nossos Termos de Serviço e Política de Privacidade
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
