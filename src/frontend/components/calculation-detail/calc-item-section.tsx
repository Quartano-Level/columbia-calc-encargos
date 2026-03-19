'use client';

import { useState } from 'react';
import type { CalculationItem } from '@/lib/types';

interface CalcItemSectionProps {
  item: CalculationItem;
  index: number;
}

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function fmtRate(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(4);
}

export function CalcItemSection({ item, index }: CalcItemSectionProps) {
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);

  return (
    <section className="border rounded-lg overflow-hidden print:break-inside-avoid">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
          {index + 1}
        </span>
        <h3 className="text-sm font-semibold text-gray-800 flex-1">{item.label}</h3>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
          item.type === 'contract'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {item.type === 'contract' ? 'Contrato' : 'Despesa'}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Parâmetros — Valores e Datas */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Parâmetros
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
            <Field label="Valor Base (BRL)" value={`R$ ${fmtBRL(item.valorBase)}`} />
            <Field label="Prazo" value={`${item.prazoEmDias} dias`} />
            <Field label="Data Base" value={fmtDate(item.dataBase)} />
            <Field label="Vencimento" value={fmtDate(item.dataVencimento)} />
          </div>
        </div>

        {/* Parâmetros — Taxas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
          <Field label="CDI (% a.a.)" value={`${item.cdiAoAno.toFixed(4)}%`} />
          <Field label="Spread (% a.a.)" value={`${item.spread.toFixed(4)}%`} />
          <Field label="Taxa Efetiva (% a.a.)" value={`${item.taxaEfetiva.toFixed(4)}%`} highlight />
          <Field label="Base de Dias" value={String(item.baseDias)} />
        </div>

        {/* Moeda original (se diferente de BRL) */}
        {item.valorMoedaOriginal != null && item.valorMoedaOriginal > 0 && item.moeda !== 'BRL' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
            <Field label={`Valor (${item.moeda})`} value={fmtBRL(item.valorMoedaOriginal)} />
          </div>
        )}

        {/* Campos específicos de contrato */}
        {item.type === 'contract' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 border-t pt-3">
            {item.taxaFechamento != null && (
              <Field label="Tx Fechamento" value={fmtRate(item.taxaFechamento)} />
            )}
            {item.taxaPtaxDI != null && (
              <Field label="Ptax D.I." value={fmtRate(item.taxaPtaxDI)} />
            )}
            {item.taxaSpotDoDia != null && (
              <Field label="Spot do Dia (BCB)" value={fmtRate(item.taxaSpotDoDia)} />
            )}
            {item.taxaSpotNegociada != null && (
              <Field label="Spot Negociada" value={fmtRate(item.taxaSpotNegociada)} />
            )}
            {item.taxaFutura != null && (
              <Field label="Taxa Futura" value={fmtRate(item.taxaFutura)} />
            )}
          </div>
        )}

        {/* Campos específicos de despesa */}
        {item.type === 'expense' && item.contasProjeto && item.contasProjeto.length > 0 && (
          <div className="border-t pt-3">
            <Field label="Contas de Projeto" value={item.contasProjeto.join(', ')} />
          </div>
        )}

        {item.type === 'expense' && item.detalhesDespesa && item.detalhesDespesa.length > 0 && (
          <div className="border-t pt-3">
            <button
              onClick={() => setShowExpenseDetails(!showExpenseDetails)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors no-print"
            >
              {showExpenseDetails ? 'Ocultar' : 'Ver'} {item.detalhesDespesa.length} lançamento(s)
            </button>
            {showExpenseDetails && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Conta Projeto</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Encargo</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Data Conversão</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Valor (BRL)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.detalhesDespesa.map((d, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 pr-4">{d.contaProjeto || '—'}</td>
                        <td className="py-2 pr-4">{d.encargo || '—'}</td>
                        <td className="py-2 pr-4">{fmtDate(d.dataConversao)}</td>
                        <td className="py-2 text-right tabular-nums">R$ {fmtBRL(d.valorBRL)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Resultado */}
        <div className="border-t pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Encargos Calculados
            </span>
            <span className="text-xl font-bold text-blue-700 tabular-nums">
              R$ {fmtBRL(item.encargosCalculados)}
            </span>
          </div>
          {item.formula && (
            <p className="mt-1.5 text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded">
              → {item.formula}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium mt-0.5 tabular-nums ${highlight ? 'text-blue-700' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  );
}
