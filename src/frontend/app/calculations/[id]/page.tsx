"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCalculation } from "@/lib/api";
import { useToast } from '@/hooks/use-toast';

export default function CalculationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { toast } = useToast();

  const [calculation, setCalculation] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchCalculation(id);
        if (mounted) setCalculation(data);
      } catch (err: any) {
        if (mounted) setError(err.message || String(err));
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false };
  }, [id]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(calculation.id);
      toast({ title: 'ID copiado', description: calculation.id });
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível copiar o ID' });
    }
  };

  const submitCalculation = async () => {
    if (!calculation?.id) return;
    if (!confirm('Confirma submeter esse cálculo ao Conecta?')) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/calculations/${calculation.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || JSON.stringify(json));
      toast({ title: 'Submetido', description: `Cálculo ${json.calculationId} submetido` });
      // atualizar status localmente
      setCalculation({ ...calculation, status: 'submitted' });
    } catch (err: any) {
      toast({ title: 'Erro ao submeter', description: err.message || String(err) });
    } finally { setSubmitting(false); }
  };

  const payload = calculation?.payload ?? calculation ?? {};
  const movimentos = Array.isArray(payload?.movimentos) ? payload.movimentos : (payload?.movements || payload?.payments || []);
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
  const formatDate = (d: any) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('pt-BR');
  };
  const totalMovimentos = movimentos.reduce((s: number, m: any) => s + (Number(m.total ?? m.value ?? m.valorUSD ?? 0) || 0), 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Detalhe do Cálculo</h2>
          <div className="text-sm text-muted-foreground mt-1">ID: <span className="font-mono">{calculation?.id ?? '—'}</span></div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/calculations')}
            className="px-3 py-2 bg-white border rounded hover:bg-gray-50"
          >Voltar</button>
          <button onClick={copyId} className="px-3 py-2 bg-white border rounded hover:bg-gray-50">Copiar ID</button>
          <button
            onClick={submitCalculation}
            disabled={submitting || calculation?.status === 'submitted'}
            className={`px-3 py-2 rounded text-white ${calculation?.status === 'submitted' ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'}`}
          >{submitting ? 'Enviando...' : (calculation?.status === 'submitted' ? 'Submetido' : 'Submeter')}</button>
        </div>
      </div>

      {loading && <div>Carregando...</div>}
      {error && <div className="text-red-600">Erro: {error}</div>}

      {calculation && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white shadow rounded p-4">
            <h3 className="font-medium mb-2">Resumo</h3>
            <div className="text-sm text-gray-700 mb-2"><strong>Processo:</strong> {calculation.processo_id ?? '—'}</div>
            <div className="text-sm text-gray-700 mb-2"><strong>Cliente:</strong> {calculation.cliente_id ?? calculation.payload?.clienteId ?? '—'}</div>
            <div className="text-sm text-gray-700 mb-2"><strong>Valor:</strong> {currency.format(Number(calculation.total_desembolso ?? 0))}</div>
            <div className="text-sm text-gray-700 mb-2"><strong>Total movimentos:</strong> {currency.format(totalMovimentos)}</div>
            <div className="text-sm text-gray-700 mb-2"><strong>Calculado em:</strong> {calculation.calculated_at ? new Date(calculation.calculated_at).toLocaleString() : '—'}</div>
            <div className="text-sm mt-3"><strong>Status:</strong> <span className={`px-2 py-1 rounded ${calculation.status === 'submitted' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{calculation.status}</span></div>
          </div>

          <div className="md:col-span-2 bg-white shadow rounded p-4">
            <h3 className="font-medium mb-4">Movimentos</h3>

            {movimentos.length === 0 && <div className="text-sm text-gray-500">Nenhum movimento disponível.</div>}

            {movimentos.length > 0 && (
              <div className="overflow-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Data</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Histórico</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Valor (USD)</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Encargos</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {movimentos.map((m: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-sm text-gray-600">{formatDate(m.data || m.pipDtaVcto || m.paymentDate)}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{m.historico || m.descricao || m.description || 'Parcela'}</td>
                        <td className="px-3 py-2 text-sm text-right text-gray-700">{currency.format(Number(m.valorUSD ?? m.value ?? m.pipMnyValor ?? 0))}</td>
                        <td className="px-3 py-2 text-sm text-right text-gray-700">{currency.format(Number(m.encargos ?? 0))}</td>
                        <td className="px-3 py-2 text-sm text-right font-medium">{currency.format(Number(m.total ?? m.value ?? m.pipMnyValor ?? 0) + Number(m.encargos ?? 0))}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-sm font-medium">Total</td>
                      <td className="px-3 py-2 text-sm text-right" />
                      <td className="px-3 py-2 text-sm text-right" />
                      <td className="px-3 py-2 text-sm text-right font-semibold">{currency.format(totalMovimentos)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button onClick={() => setShowPayload(!showPayload)} className="px-3 py-2 bg-white border rounded hover:bg-gray-50">{showPayload ? 'Ocultar payload' : 'Mostrar payload'}</button>
              <Link href="/calculations" className="text-blue-600 hover:underline">Voltar ao histórico</Link>
            </div>

            {showPayload && (
              <pre className="mt-4 text-xs bg-gray-100 p-3 rounded max-h-96 overflow-auto">{JSON.stringify(payload, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
