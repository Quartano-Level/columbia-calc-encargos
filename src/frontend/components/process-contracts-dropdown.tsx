"use client";

import { useEffect, useState } from "react";
import { fetchContractsByProcess } from "@/lib/api";

interface ProcessContractsDropdownProps {
    priCod: number;
}

export function ProcessContractsDropdown({ priCod }: ProcessContractsDropdownProps) {
    const [contracts, setContracts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadContracts() {
            try {
                setLoading(true);
                const data = await fetchContractsByProcess(priCod);
                setContracts(data || []);
            } catch (err) {
                console.warn('Failed to load contracts for process', priCod, err);
                setContracts([]);
            } finally {
                setLoading(false);
            }
        }
        loadContracts();
    }, [priCod]);

    if (loading) {
        return (
            <div className="mt-3">
                <label className="text-xs text-muted-foreground">Contrato(s) relacionado(s)</label>
                <div className="w-full mt-1 border rounded px-2 py-1 text-sm text-muted-foreground">
                    Carregando...
                </div>
            </div>
        );
    }

    return (
        <div className="mt-3">
            <label className="text-xs text-muted-foreground">Contrato(s) relacionado(s)</label>
            <select
                className="w-full mt-1 border rounded px-2 py-1 text-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <option value="">
                    {contracts.length === 0 ? "— Nenhum contrato —" : "— Selecione um contrato —"}
                </option>
                {contracts.map((c: any) => (
                    <option key={c.imcCod || c.imcNumNumero} value={c.imcCod || c.imcNumNumero}>
                        {`${c.imcNumNumero || c.imcCod} — ${c.moeEspNome || ''} — ${Number(c.vlrMneg || 0).toFixed(2)}`}
                    </option>
                ))}
            </select>
        </div>
    );
}
