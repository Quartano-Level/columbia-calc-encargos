'use client';

import { useState } from 'react';
import type { Movimento } from '@/lib/types';

interface CalcDetailTableProps {
  movimentos: Movimento[];
}

function fmtUSD(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CalcDetailTable({ movimentos }: CalcDetailTableProps) {
  const [showFormulas, setShowFormulas] = useState(true);

  const totalValor = movimentos.reduce((acc, m) => acc + m.valorUSD, 0);
  const totalEncargos = movimentos.reduce((acc, m) => acc + m.encargos, 0);

  return (
    <section className="border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Detalhamento do Cálculo
        </h2>
        <button
          onClick={() => setShowFormulas(!showFormulas)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors no-print"
        >
          {showFormulas ? 'Ocultar fórmulas' : 'Mostrar fórmulas'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 pr-4 font-medium text-muted-foreground">#</th>
              <th className="pb-2 pr-4 font-medium text-muted-foreground">Componente</th>
              <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Valor Base (USD)</th>
              <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Dias</th>
              <th className="pb-2 font-medium text-muted-foreground text-right">Encargo (USD)</th>
            </tr>
          </thead>
          <tbody>
            {movimentos.map((m, i) => (
              <tr key={i} className="group">
                <td colSpan={5} className="p-0">
                  {/* Linha principal */}
                  <div className="flex items-center border-b border-dashed py-2.5">
                    <span className="pr-4 text-muted-foreground tabular-nums w-8">{i + 1}</span>
                    <span className="pr-4 flex-1 min-w-0 truncate">{m.historico}</span>
                    <span className="pr-4 text-right tabular-nums w-32">{fmtUSD(m.valorUSD)}</span>
                    <span className="pr-4 text-right tabular-nums w-16">{m.diasCorridos}</span>
                    <span className="text-right tabular-nums font-medium text-blue-700 w-32">
                      {fmtUSD(m.encargos)}
                    </span>
                  </div>
                  {/* Fórmula */}
                  {showFormulas && m.formula && (
                    <div className="pl-8 py-1.5 text-xs text-muted-foreground font-mono bg-muted/30 border-b">
                      → {m.formula}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t-2">
              <td className="pt-3 pr-4"></td>
              <td className="pt-3 pr-4">TOTAL</td>
              <td className="pt-3 pr-4 text-right tabular-nums">{fmtUSD(totalValor)}</td>
              <td className="pt-3 pr-4"></td>
              <td className="pt-3 text-right tabular-nums text-blue-700">{fmtUSD(totalEncargos)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
