import { CalculationResult } from '../types/index.js';
import { CalculationResultSchema } from '../types/schemas.js';
import { conexosService } from './conexos.js';
import { saveCalculation, getCalculationById } from './supabase.js';
import { calculationInputHash, logEvent } from '../utils/index.js';

export async function orchestrateCalculation(input: any): Promise<CalculationResult> {
  // 1. Buscar dados do processo no Conexos
  const process = await conexosService.getProcessById(input.processId);
  const cdiList = await conexosService.getCDI();
  const parcelas = await conexosService.getParcelsByProcessId(input.processId);
  const despesas = await conexosService.getDespesasByProcessId(input.processId);

  // 2. Normalizar e calcular principais campos
  // garantir que processoId e clienteId sejam strings (zod exige string)
  const processoId = String(process?.imcCod ?? input.processId ?? '');
  const clienteId = String(process?.cliCod ?? input.clienteId ?? 'N/A');
  const fobTotal = Number(process?.vlrMneg) || 0;
  const freteTotal = Number(process?.freteTotal) || 0;
  const seguroTotal = Number(process?.seguroTotal) || 0;
  const cifTotal = fobTotal + freteTotal + seguroTotal;

  // CDI: pegar taxa mais recente
  const cdiAM = Number(cdiList?.[0]?.ftxNumFatDiario) || input.taxaCDI || 0;

  // Mapear parcelas para movimentos (converte timestamps numéricos para string ISO 'YYYY-MM-DD')
  const toDateIso = (d: any) => {
    if (!d) return new Date().toISOString();
    if (typeof d === 'number') return new Date(d).toISOString().split('T')[0];
    // se já for string, tentar normalizar
    try { return new Date(d).toISOString().split('T')[0]; } catch { return String(d); }
  };

  const movimentos = Array.isArray(parcelas)
    ? parcelas.map((p: any) => ({
        data: toDateIso(p.pipDtaVcto || p.data || p.dtaVcto || p.dta),
        historico: p.historico || p.descricao || 'Parcela',
        diasCorridos: Number(p.pipNumDiasVcto || p.diasCorridos || 0) || 0,
        txSpot: Number(p.txSpot || p.tx_spot || 0) || 0,
        valorUSD: Number(p.pipMnyValor || p.valorUSD || 0) || 0,
        encargos: Number(p.encargos || p.encargo || 0) || 0,
        total: Number(p.pipMnyValor || p.valorUSD || 0) + (Number(p.encargos || p.encargo || 0) || 0),
      }))
    : [];

  // Mapear despesas
  const despesasMap = Array.isArray(despesas)
    ? despesas.map((d: any) => ({
        tipo: d.tipo || '',
        descricao: d.descricao || '',
        valor: Number(d.valor) || 0,
      }))
    : [];

  // Summary
  const summary = {
    numeroMovimentos: movimentos.length,
    totalDesembolso: movimentos.reduce((acc, m) => acc + m.total, 0),
    calculadoEm: new Date().toISOString(),
  };

  const result: CalculationResult = {
    processId: processoId,
    // Compatibilidade com frontend que espera `processoId`
    clienteId,
    custosUSD: { fobTotal, freteTotal, seguroTotal, cifTotal },
    cambio: {
      cdiAM,
      txSpotCompra: 0,
      txFuturaVenc: 0,
      taxaDolarFiscal: 0,
      valorCIFbrl: 0,
    },
    impostos: {},
    creditos: {},
    despesas: despesasMap,
    encargos: {},
    custos: {},
    precos: {},
    movimentos,
    summary,
    totalDisburse: summary.totalDesembolso || 0,
    totalInterest: 0,
    totalCharges: 0,
    payments: [],
  };

  // 3. Validar
  CalculationResultSchema.parse(result);

  // 4. Persistir no Supabase (salva mapeado para colunas corretas)
  await saveCalculation(result, calculationInputHash(input));

  // 5. Logging
  logEvent('calculation_created', { processId: result.processId });

  return result;
}
