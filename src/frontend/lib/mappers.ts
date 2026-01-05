// Mapping helper: converts legacy Conexos/n8n `Calculate` outputs or raw backend shapes into canonical CalculationResult

export type RawBackend = any;

export type CalculationResult = {
  processoId: string | number;
  clienteId?: string | number;
  custosUSD?: Record<string, any>;
  cambio?: Record<string, any>;
  impostos?: Record<string, any>;
  despesas?: Record<string, any>;
  encargos?: Record<string, any>;
  custos?: Record<string, any>;
  precos?: Record<string, any>;
  movimentos: Array<any>;
  summary: { numeroMovimentos: number; totalDesembolso: number; calculadoEm: string };
  [k: string]: any;
};

function toNumberSafe(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDateIso(msOrDate: any): string {
  if (!msOrDate) return new Date().toISOString().split('T')[0];
  if (typeof msOrDate === 'number') return new Date(msOrDate).toISOString().split('T')[0];
  // try Date parse
  const d = new Date(msOrDate);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

export function mapBackendToCalculationResult(raw: RawBackend): CalculationResult {
  // Some n8n nodes return { body: { ... } } or wrapped shapes; normalize
  let payload = raw;
  if (payload && payload.body) payload = payload.body;

  // If it already looks like the canonical shape, return with light coercion
  if (payload && payload.movimentos && Array.isArray(payload.movimentos) && payload.summary) {
    const movimentos = payload.movimentos.map((m: any) => ({
      data: toDateIso(m.data),
      historico: m.historico || m.history || '',
      diasCorridos: toNumberSafe(m.diasCorridos || m.dias || 0),
      txSpot: toNumberSafe(m.txSpot || m.tx_spot || 0),
      valorUSD: toNumberSafe(m.valorUSD || m.valorUSD || m.valor || 0),
      encargos: toNumberSafe(m.encargos || 0),
      total: toNumberSafe(m.total || 0),
      ...m
    }));

    const summary = payload.summary || {};
    return {
      ...payload,
      movimentos,
      summary: {
        numeroMovimentos: toNumberSafe(summary.numeroMovimentos || movimentos.length),
        totalDesembolso: toNumberSafe(summary.totalDesembolso || movimentos.reduce((s: number, x: any) => s + toNumberSafe(x.total), 0)),
        calculadoEm: summary.calculadoEm || new Date().toISOString()
      }
    } as CalculationResult;
  }

  // Legacy Conexos-like shape: movimentos / custos / summary
  const movimentosRaw = payload.movimentos || payload.movimentos || payload.movements || [];
  const movimentos = (Array.isArray(movimentosRaw) ? movimentosRaw : []).map((m: any) => ({
    data: toDateIso(m.data || m.pipDtaVcto || m.dtaVcto),
    historico: m.historico || m.historico || m.historico || '',
    diasCorridos: toNumberSafe(m.diasCorridos || m.pipNumDiasVcto || 0),
    txSpot: toNumberSafe(m.txSpot || m.tx_spot || 0),
    valorUSD: toNumberSafe(m.valorUSD || m.valorUSD || m.pipMnyValor || 0),
    encargos: toNumberSafe(m.encargos || 0),
    total: toNumberSafe(m.total || m.vlrMnac || 0),
    ...m
  }));

  const summaryRaw = payload.summary || {};
  const summary = {
    numeroMovimentos: toNumberSafe(summaryRaw.numeroMovimentos || movimentos.length),
    totalDesembolso: toNumberSafe(summaryRaw.totalDesembolso || movimentos.reduce((s: number, x: any) => s + toNumberSafe(x.total), 0)),
    calculadoEm: summaryRaw.calculadoEm || new Date().toISOString()
  };

  return {
    processoId: payload.processoId || payload.processoId || payload.processo_id || payload.processo || 'unknown',
    clienteId: payload.clienteId || payload.cliente_id || payload.cliente || undefined,
    custosUSD: payload.custosUSD || payload.custos || {},
    cambio: payload.cambio || {},
    impostos: payload.impostos || {},
    despesas: payload.despesas || {},
    encargos: payload.encargos || {},
    custos: payload.custos || {},
    precos: payload.precos || {},
    movimentos,
    summary,
    _raw: raw
  } as CalculationResult;
}
