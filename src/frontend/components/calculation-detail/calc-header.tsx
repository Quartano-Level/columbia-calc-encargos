'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface CalcHeaderProps {
  calculationId: string;
}

export function CalcHeader({ calculationId }: CalcHeaderProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(calculationId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between no-print">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Memória de Cálculo de Encargos Financeiros
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Detalhamento completo do cálculo com fórmulas aplicadas
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/calculations')}
          className="px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
        >
          ← Voltar
        </button>
        <button
          onClick={handleCopy}
          className="px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
        >
          {copied ? '✓ Copiado' : 'Copiar ID'}
        </button>
        <button
          onClick={() => window.print()}
          className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
}
