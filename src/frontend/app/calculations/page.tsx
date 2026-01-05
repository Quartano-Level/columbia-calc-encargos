"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCalculations } from "@/lib/api";

export default function CalculationsListPage() {
  const [calculations, setCalculations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchCalculations(100);
        if (mounted) setCalculations(data || []);
      } catch (err: any) {
        if (mounted) setError(err.message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Histórico de Cálculos</h2>
      {loading && <div>Carregando...</div>}
      {error && <div className="text-red-600">Erro: {error}</div>}
      {!loading && !error && (
        <div className="bg-white shadow rounded">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">ID</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Processo</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Total</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Calculado em</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {calculations.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-sm text-gray-600">{c.id}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{c.processo_id}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{c.total_desembolso ?? c.total_desembolso}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{c.calculated_at ? new Date(c.calculated_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    <Link className="text-blue-600 hover:underline" href={`/calculations/${c.id}`}>Ver</Link>
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
