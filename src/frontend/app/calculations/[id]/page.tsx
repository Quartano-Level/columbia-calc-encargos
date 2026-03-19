'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchCalculation } from '@/lib/api';
import type { CalculationRecord, CalculationPayload, CalculationPayloadV2, Movimento } from '@/lib/types';
import {
  CalcHeader,
  CalcIdentification,
  CalcParameters,
  CalcDetailTable,
  CalcItemSection,
  CalcResult,
  CalcFooter,
} from '@/components/calculation-detail';

function isV2Payload(payload: any): payload is CalculationPayloadV2 {
  return payload?.payloadVersion === 2 && Array.isArray(payload?.items);
}

export default function CalculationDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<CalculationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchCalculation(id);
        if (mounted) setRecord(data as CalculationRecord);
      } catch (err: unknown) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Carregando memória de cálculo...</div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="p-8">
        <div className="text-red-600 border border-red-200 rounded-lg p-4">
          Erro ao carregar cálculo: {error || 'Cálculo não encontrado'}
        </div>
      </div>
    );
  }

  const payload = record.payload ?? ({} as CalculationPayload);

  // v2: layout empilhado por item
  if (isV2Payload(payload)) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6 print:p-4 print:max-w-none">
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">Memória de Cálculo de Encargos Financeiros</h1>
          <p className="text-sm text-gray-500">Columbia Trading — Gerado em {new Date().toLocaleString('pt-BR')}</p>
        </div>

        <CalcHeader calculationId={record.id} />
        <CalcIdentification record={record} />

        {payload.items.map((item, i) => (
          <CalcItemSection key={item.id} item={item} index={i} />
        ))}

        <CalcResult
          totalEncargos={payload.totalEncargos}
          totalDesembolso={payload.totalValorBase}
          itemCount={payload.items.length}
          currency="BRL"
        />
        <CalcFooter record={record} />
      </div>
    );
  }

  // v1: layout legado com movimentos flat
  const v1Payload = payload as CalculationPayload;
  const movimentos: Movimento[] = Array.isArray(v1Payload.movimentos) ? v1Payload.movimentos : [];
  const totalEncargos = movimentos.reduce((acc, m) => acc + (m.encargos ?? 0), 0);
  const totalDesembolso = movimentos.reduce((acc, m) => acc + (m.valorUSD ?? 0), 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 print:p-4 print:max-w-none">
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">Memória de Cálculo de Encargos Financeiros</h1>
        <p className="text-sm text-gray-500">Columbia Trading — Gerado em {new Date().toLocaleString('pt-BR')}</p>
      </div>

      <CalcHeader calculationId={record.id} />
      <CalcIdentification record={record} />
      <CalcParameters payload={v1Payload} />

      {movimentos.length > 0 ? (
        <CalcDetailTable movimentos={movimentos} />
      ) : (
        <section className="border rounded-lg p-5">
          <p className="text-sm text-muted-foreground">Nenhum movimento disponível neste cálculo.</p>
        </section>
      )}

      <CalcResult totalEncargos={totalEncargos} totalDesembolso={totalDesembolso} />
      <CalcFooter record={record} />
    </div>
  );
}
