'use client'

import { useState, useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { X, AlertTriangle, ExternalLink } from 'lucide-react'

interface AuthErrorAlertProps {
  error: string
  onDismiss: () => void
}

export function AuthErrorAlert({ error, onDismiss }: AuthErrorAlertProps) {
  const [isVisible, setIsVisible] = useState(true)
  const isExchangeCodeError = error.includes('Unable to exchange external code')

  // Auto-dismiss success message after 5 seconds if not an error
  useEffect(() => {
    if (!isExchangeCodeError) {
      const timer = setTimeout(() => {
        handleDismiss()
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [isExchangeCodeError])

  const handleDismiss = () => {
    setIsVisible(false)
    onDismiss()
  }

  if (!isVisible) return null

  return (
    <Alert variant="destructive" className="mb-6 border-2">
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        
        <div className="flex-1 min-w-0">
          <AlertDescription className="font-semibold text-base mb-3">
            ❌ Erro ao fazer login com Microsoft
          </AlertDescription>
          
          {isExchangeCodeError ? (
            <div className="space-y-4 text-sm">
              <p>
                Não foi possível completar a autenticação. O Supabase não conseguiu trocar o código do Azure AD por um access token.
              </p>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="font-semibold mb-2">🔍 Possíveis causas:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li><strong>Client ID</strong> incorreto no Supabase</li>
                  <li><strong>Client Secret</strong> incorreto ou expirado no Supabase</li>
                  <li><strong>Tenant ID</strong> incorreto no Supabase</li>
                  <li><strong>Redirect URI</strong> não configurada no Azure AD</li>
                </ul>
              </div>

              <div className="bg-white border border-gray-300 rounded-lg p-4">
                <p className="font-semibold mb-3">✅ Como resolver:</p>
                
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-gray-900 mb-1">1. Verificar no Azure Portal:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-gray-700">
                      <li>Azure AD → App registrations → Seu App</li>
                      <li>Copie: Application (client) ID, Client Secret, Tenant ID</li>
                      <li>Authentication → Redirect URIs deve conter:</li>
                    </ul>
                    <code className="block bg-gray-100 px-3 py-2 rounded text-xs mt-1 ml-4 font-mono">
                      https://pfnpyvtgmghoocbiqrie.supabase.co/auth/v1/callback
                    </code>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 mb-1">2. Verificar no Supabase Dashboard:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-gray-700">
                      <li>Authentication → Providers → Azure</li>
                      <li>Confirme que está habilitado (Enable)</li>
                      <li>Cole as credenciais do Azure corretamente</li>
                      <li>Client Secret deve ser o <strong>VALUE</strong>, não o ID</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 mb-1">3. Salvar e aguardar:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-gray-700">
                      <li>Clique em Save no Supabase</li>
                      <li>Aguarde 1-2 minutos para propagação</li>
                      <li>Limpe o cache do navegador (Ctrl+Shift+Del)</li>
                      <li>Tente fazer login novamente</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => window.open('https://portal.azure.com', '_blank')}
                >
                  <ExternalLink size={16} />
                  Abrir Azure Portal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => window.open('https://supabase.com/dashboard/project/pfnpyvtgmghoocbiqrie/auth/providers', '_blank')}
                >
                  <ExternalLink size={16} />
                  Abrir Supabase Auth
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => window.open('/docs/AZURE_AD_TROUBLESHOOTING.md', '_blank')}
                >
                  <ExternalLink size={16} />
                  Ver Guia Completo
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <p className="mb-2">{error}</p>
              <p className="text-gray-700">
                Verifique a configuração do Azure AD e Supabase seguindo o guia de troubleshooting.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-red-800 hover:text-red-900 transition"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
      </div>
    </Alert>
  )
}
