"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { AppSettings, fetchSettings, updateSettings } from "@/lib/api";

const FILIAL_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const DEFAULT_SETTINGS: AppSettings = {
  filial_padrao: "2",
  fonte_cdi: "bcb",
  cdi_manual: "",
};

export default function SettingsPage() {
  const [form, setForm] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchSettings();
        if (mounted) setForm({ ...DEFAULT_SETTINGS, ...data });
      } catch (err: unknown) {
        if (mounted) setError((err as Error).message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateSettings(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="p-6 max-w-2xl">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Configurações</h2>
        <p className="text-sm text-gray-500 mb-6">Parâmetros operacionais do sistema. Alterações têm efeito imediato.</p>

        {loading && (
          <div className="text-gray-500 text-sm">Carregando configurações...</div>
        )}

        {!loading && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {/* Filial Padrão */}
            <div className="p-5 flex items-start gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filial Padrão
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Filial utilizada nas consultas ao Conexos (cnx-filcod).
                </p>
                <select
                  value={form.filial_padrao}
                  onChange={(e) => setForm({ ...form, filial_padrao: e.target.value })}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                >
                  {FILIAL_OPTIONS.map((f) => (
                    <option key={f} value={String(f)}>
                      Filial {f}{f === 2 ? " (padrão)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fonte CDI */}
            <div className="p-5 flex items-start gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fonte do CDI
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Banco Central (BCB) usa a série 12 via API pública. Conexos usa a taxa diária do contrato.
                </p>
                <select
                  value={form.fonte_cdi}
                  onChange={(e) =>
                    setForm({ ...form, fonte_cdi: e.target.value as "bcb" | "conexos" })
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                >
                  <option value="bcb">Banco Central (BCB) — recomendado</option>
                  <option value="conexos">Conexos</option>
                </select>
              </div>
            </div>

            {/* CDI Manual */}
            <div className="p-5 flex items-start gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CDI Manual (fallback)
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Taxa CDI em % ao ano usada quando a fonte configurada não está disponível. Deixe vazio para não usar fallback.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="ex: 12.65"
                    value={form.cdi_manual}
                    onChange={(e) => setForm({ ...form, cdi_manual: e.target.value })}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                  />
                  <span className="text-sm text-gray-500">% ao ano</span>
                </div>
              </div>
            </div>

            {/* Rodapé */}
            <div className="p-5 flex items-center justify-between">
              <div>
                {error && (
                  <p className="text-sm text-red-600">Erro: {error}</p>
                )}
                {success && (
                  <p className="text-sm text-green-600">Configurações salvas com sucesso.</p>
                )}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#337ab7] text-white text-sm font-medium rounded-md hover:bg-blue-700 transition disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </ProtectedRoute>
  );
}
