import { CalculationResult, CalculationInput, InputSnapshot, Payment } from '../types/index.js';
import { CalculationResultSchema } from '../types/schemas.js';
import { conexosService } from './conexos.js';
import { cdiCalculatorService } from './cdi-calculator.js';
import { calcEncargosSimples } from './encargos-calculator.js';
import { config } from '../config.js';
import { saveCalculation, getCalculationById } from './supabase.js';
import { calculationInputHash, logEvent, boxLog, DEBUG_VERBOSE } from '../utils/index.js';

export async function orchestrateCalculation(input: CalculationInput): Promise<CalculationResult> {
  boxLog('Service: orchestrateCalculation Input', input);

  // 1. Buscar dados do processo no Conexos (em paralelo — são independentes)
  const [process, cdiList, parcelas, despesas] = await Promise.all([
    conexosService.getProcessById(input.processId),
    conexosService.getCDI(),
    conexosService.getParcelsByProcessId(input.processId),
    conexosService.getDespesasByProcessId(input.processId),
  ]);

  boxLog('Conexos Data Fetched', {
    processNumber: process?.imcNumNumero,
    cdiFirst: cdiList?.[0],
    parcelsCount: parcelas?.length,
    despesasCount: despesas?.length
  });

  // 2. Normalizar e calcular principais campos
  const processoId = String(process?.imcCod ?? input.processId ?? '');
  const clienteId = String(process?.cliCod ?? (input as any).clienteId ?? 'N/A');
  const processoNumero = String(process?.imcNumNumero ?? '');
  const clienteNome = String(process?.dpeNomPessoaCons || process?.dpeNomPessoa || '');
  const fobTotal = Number(process?.vlrMneg) || 0;
  const freteTotal = Number(process?.freteTotal) || 0;
  const seguroTotal = Number(process?.seguroTotal) || 0;
  const cifTotal = fobTotal + freteTotal + seguroTotal;

  // CDI: PRIORIZAR INPUT MANUAL (CDI Diário)
  const cdiConexosRaw = Number(cdiList?.[0]?.ftxNumFatDiario) || 0;
  const cdiFromInput = input.taxaCDI !== undefined && Number(input.taxaCDI) > 0;
  const cdiDiario = cdiFromInput ? Number(input.taxaCDI) : cdiConexosRaw;
  const cdiSource: InputSnapshot['cdiSource'] = cdiFromInput ? 'manual' : 'conexos';
  const txSpotCompra = Number(input.taxaConexos) || 0;

  // Mapear parcelas para movimentos
  const toDateIso = (d: any) => {
    if (!d) return new Date().toISOString().split('T')[0];
    if (typeof d === 'number') return new Date(d).toISOString().split('T')[0];
    try { return new Date(d).toISOString().split('T')[0]; } catch { return String(d); }
  };

  // PRIORIZAR PAGAMENTOS ENVIADOS PELO FRONTEND
  const inputPayments = Array.isArray(input.payments) && input.payments.length > 0 ? input.payments : null;
  const movimentosSource: InputSnapshot['movimentosSource'] = inputPayments ? 'frontend' : 'conexos';
  const rawSource = inputPayments || parcelas || [];

  const taxaAnualCalc = cdiDiario * config.calcBase;
  const taxaDiariaCalc = taxaAnualCalc / config.calcBase / 100; // = cdiDiario / 100

  const movimentos = rawSource.map((p: any) => {
    const valorUSD = Number(p.pipMnyValor || p.valorUSD || p.value || 0) || 0;
    const dias = Number(p.pipNumDiasVcto || p.diasCorridos || p.days || 0) || 0;

    // Fórmula: Juros = Valor × (taxaAnual / base / 100) × Dias
    const encargos = calcEncargosSimples(valorUSD, taxaAnualCalc, dias || 0, config.calcBase);

    // RF-02: Breakdown de fórmula
    const fmtVal = valorUSD.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtEnc = encargos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formula = `${fmtVal} × (${taxaAnualCalc.toFixed(4)} / ${config.calcBase} / 100) × ${dias} = ${fmtEnc}`;

    return {
      data: toDateIso(p.pipDtaVcto || p.data || p.dtaVcto || p.paymentDate || p.dta),
      historico: p.historico || p.description || p.descricao || 'Parcela',
      diasCorridos: dias,
      txSpot: txSpotCompra,
      valorUSD: valorUSD,
      encargos: encargos,
      total: valorUSD + encargos,
      taxaAnualUsada: taxaAnualCalc,
      taxaDiariaUsada: taxaDiariaCalc,
      baseDias: config.calcBase,
      formula,
    };
  });

  boxLog('Processed Movimentos', movimentos);

  // 3. Buscar Títulos e Baixas (psq015) para Juros Perdidos (Atraso)
  const financialTitles = await conexosService.getFinancialTitlesPsq015(Number(processoId));

  const enrichedPayments = await Promise.all(financialTitles.map(async (title: any) => {
    const discharges = await conexosService.getTitleDischargesPsq015(title);

    // Cada título pode ter múltiplas baixas
    const processedDischarges = await Promise.all(discharges.map(async (bxa: any) => {
      const dueDate = toDateIso(title.titDtaVencimento);
      const paymentDate = toDateIso(bxa.borDtaMvto || bxa.bxaDtaBaixa);
      const principal = Number(bxa.bxaMnyValor || 0);

      let lostInterest = 0;
      let lateDays = 0;
      let factor = 1;

      if (principal > 0 && paymentDate > dueDate) {
        const result = await cdiCalculatorService.calculateLostInterest(principal, dueDate, paymentDate);
        lostInterest = result.lostInterest;
        lateDays = result.days;
        factor = result.accumulatedFactor;
      }

      return {
        ...bxa,
        dueDate,
        paymentDate,
        lostInterest,
        lateDays,
        accumulatedFactor: factor,
        principal
      };
    }));

    const titleLostInterest = processedDischarges.reduce((acc, d) => acc + d.lostInterest, 0);

    if (titleLostInterest > 0 && title.priCod === 82) {
      if (DEBUG_VERBOSE) console.log(`[Calculation DEBUG 82] Juros Perdidos detectados no título ${title.titEspNumero || title.docCod}: R$ ${titleLostInterest.toFixed(2)}`);
    }

    return {
      ...title,
      discharges: processedDischarges,
      lostInterest: titleLostInterest,
      dueDate: toDateIso(title.titDtaVencimento),
      // Para retrocompatibilidade no front se necessário:
      paymentDate: processedDischarges.length > 0 ? processedDischarges[0].paymentDate : null,
      lateDays: processedDischarges.reduce((acc, d) => acc + d.lateDays, 0)
    };
  }));

  const totalLostInterest = enrichedPayments.reduce((acc, p) => acc + (p.lostInterest || 0), 0);
  const totalInterest = movimentos.reduce((acc: number, m: any) => acc + m.encargos, 0);
  const totalDisburse = movimentos.reduce((acc: number, m: any) => acc + m.valorUSD, 0);

  // Variação Cambial = Valor USD × (Ptax DI - Taxa Fechamento)
  // Positivo = perda cambial (dólar ficou mais caro); Negativo = ganho cambial
  const taxaPtaxDI = Number(input.taxaPtaxDI) || Number((process as any)?.taxaPtaxDI) || 0;
  const taxaFechamento = Number(process?.imcFltTxFec) || 0;
  const variacaoCambial = (fobTotal > 0 && taxaPtaxDI > 0 && taxaFechamento > 0)
    ? fobTotal * (taxaPtaxDI - taxaFechamento)
    : 0;

  // Mapear despesas (considerando campos do Conexos vindos de imp021)
  const despesasMap = Array.isArray(despesas)
    ? despesas.map((d: any) => ({
      tipo: d.ctpDesNome || d.tipo || '',
      descricao: d.impDesNome || d.descricao || '',
      valor: Number(d.pidMnyValormn || d.valor || 0),
    }))
    : [];

  if (DEBUG_VERBOSE) console.log(`[orchestrateCalculation] Despesas mapped:`, despesasMap.length);

  // Verificar se já existe lançamento de "ENCARGOS FINANCEIROS"
  const hasExistingInterest = despesasMap.some(d =>
    (d.descricao || '').toUpperCase().includes('ENCARGOS FINANCEIROS') ||
    (d.tipo || '').toUpperCase().includes('ENCARGOS FINANCEIROS')
  );

  if (DEBUG_VERBOSE) console.log(`[orchestrateCalculation] hasExistingInterest:`, hasExistingInterest);

  const result: CalculationResult = {
    processId: processoId,
    processoNumero,
    clienteId,
    clienteNome,
    custosUSD: { fobTotal, freteTotal, seguroTotal, cifTotal },
    cambio: {
      cdiAM: cdiDiario,
      txSpotCompra,
      txFuturaVenc: txSpotCompra,
      taxaDolarFiscal: Number(process?.imcFltTxFec) || 0,
      valorCIFbrl: cifTotal * (Number(process?.imcFltTxFec) || 1),
    },
    impostos: {},
    creditos: {},
    despesas: despesasMap,
    encargos: {
      variacaoCambial,
      total: totalInterest,
    },
    custos: {
      custoTotalImportacao: totalDisburse + totalInterest,
    },
    precos: {},
    movimentos,
    summary: {
      numeroMovimentos: movimentos.length,
      totalDesembolso: totalDisburse,
      calculadoEm: new Date().toISOString(),
      calculationDate: new Date().toISOString(),
      taxaCDI: cdiDiario,
      taxaConexos: txSpotCompra,
      effectiveRate: (txSpotCompra + cdiDiario) / 100,
    },
    totalDisburse: totalDisburse,
    totalInterest: totalInterest,
    totalLostInterest: totalLostInterest,
    totalCharges: totalDisburse + totalInterest,
    hasExistingInterest: hasExistingInterest,
    payments: enrichedPayments,
    inputSnapshot: {
      originalInput: input,
      cdiSource,
      cdiConexosRaw,
      cdiUsado: cdiDiario,
      baseDias: config.calcBase,
      fetchedAt: new Date().toISOString(),
      configUsado: {
        filCod: config.conexos.filCod,
        impCod: config.conexos.impCod,
        ctpCod: config.conexos.ctpCod,
        usnCod: config.conexos.usnCod,
        calcBase: config.calcBase,
      },
      movimentosSource,
    },
  };

  boxLog('Calculation Final Result', result);

  // 3. Validar
  CalculationResultSchema.parse(result);

  // 4. Persistir no Supabase e capturar UUID gerado
  const { data: saved, error: saveError } = await saveCalculation(result, calculationInputHash(input));
  if (saveError) {
    console.error('[orchestrateCalculation] Erro ao persistir cálculo no Supabase:', saveError.message);
    throw new Error(`Falha ao salvar cálculo: ${saveError.message}`);
  }
  const savedId: string | undefined = (saved as any)?.[0]?.id ?? undefined;

  // 5. Logging
  logEvent('calculation_created', { processId: result.processId, calculationId: savedId });

  return { ...result, id: savedId };
}
