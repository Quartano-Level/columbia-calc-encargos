"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { fetchCalculations } from "@/lib/api";

export default function CalculationsListPage() {
  const [calculations, setCalculations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProcess, setFilterProcess] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchCalculations(200);
        if (mounted) setCalculations(data || []);
      } catch (err: any) {
        if (mounted) setError(err.message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  const currencyUSD = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
  const currencyBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const filtered = useMemo(() => {
    const q = filterProcess.toLowerCase().trim();
    return calculations.filter((c: any) => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (q) {
        const processo = [
          c.processo_numero,
          c.payload?.refExterna,
          c.payload?.processoNumero,
          c.processo_id,
        ].filter(Boolean).join(' ').toLowerCase();
        const cliente = [
          c.cliente_nome,
          c.payload?.clienteNome,
          c.payload?.items?.[0]?.label,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!processo.includes(q) && !cliente.includes(q)) return false;
      }
      return true;
    });
  }, [calculations, filterStatus, filterProcess]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Histórico de Cálculos</h2>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar processo ou cliente..."
          value={filterProcess}
          onChange={(e) => setFilterProcess(e.target.value)}
          className="px-3 py-2 border rounded text-sm w-64"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border rounded text-sm"
        >
          <option value="all">Todos os status</option>
          <option value="calculated">Calculado</option>
          <option value="submitted">Submetido</option>
        </select>
        <div className="text-sm text-gray-500 self-center">{filtered.length} resultado(s)</div>
      </div>

      {loading && <div>Carregando...</div>}
      {error && <div className="text-red-600">Erro: {error}</div>}
      {!loading && !error && (
        <div className="bg-white shadow rounded overflow-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Processo</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cliente</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total (USD)</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Encargos</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Calculado em</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-700 font-medium">
                    <Link href={`/processes/${c.processo_id}`} className="text-blue-600 hover:underline">
                      {c.processo_numero || c.payload?.refExterna || c.payload?.processoNumero || c.processo_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">{c.cliente_nome || c.payload?.clienteNome || c.payload?.items?.[0]?.label || '—'}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-700">{currencyUSD.format(Number(c.total_desembolso ?? 0))}</td>
                  <td className="px-4 py-2 text-sm text-right text-blue-700 font-semibold">{currencyBRL.format(Number(c.total_encargos ?? 0))}</td>
                 
                  <td className="px-4 py-2 text-sm text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.status === 'submitted' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {c.status === 'submitted' ? 'Submetido' : 'Calculado'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">{c.calculated_at ? new Date(c.calculated_at).toLocaleString('pt-BR') : '—'}</td>
                  <td className="px-4 py-2 text-sm">
                    <Link className="text-blue-600 hover:underline" href={`/calculations/${c.id}`}>Ver detalhe</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
