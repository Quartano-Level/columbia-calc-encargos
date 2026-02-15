import { Router } from 'express';

const router = Router();

import { conexosService } from '../services/conexos.js';
import { supabase } from '../services/supabase.js';

// Middleware de debug: log do path recebido (útil para verificar roteamento)
router.use((req, _res, next) => {
  if (req.path && (req.path.includes('all') || req.path.includes('for-export') || req.path.includes('with-contracts'))) {
    if (process.env.DEBUG_VERBOSE === '1') console.log('[processes] Incoming:', req.method, req.path, '| baseUrl:', req.baseUrl);
  }
  next();
});

// ROTAS LITERAIS PRIMEIRO (antes de /:id) - senão /:id captura "all", "for-export", "with-contracts"
// GET /processes/all - TODOS os processos (sem filtro de contratos) para exportação
router.get('/all', async (_req, res) => {
  try {
    if (process.env.DEBUG_VERBOSE === '1') console.log('[processes/all] ✓ Buscando todos os processos');
    const processes = await conexosService.getAllProcesses();
    // Normalizar para formato esperado pela planilha (contracts e payments vazios)
    const normalized = processes.map((p: any) => ({
      ...p,
      clientName: p.dpeNomPessoa || p.clientName || '',
      processNumber: p.priEspRefcliente || p.processNumber || String(p.priCod || ''),
      contracts: [],
      payments: [],
    }));
    res.json({ source: 'conexos', data: { processes: normalized } });
  } catch (err: any) {
    console.error('[processes/all] Error:', err.message);
    res.status(502).json({
      error: 'Erro ao buscar processos',
      details: err.message,
    });
  }
});

// GET /processes/for-export - legado (mantido para compatibilidade, usa lógica antiga)
router.get('/for-export', async (req, res) => {
  try {
    const filCod = req.query.filCod ? parseInt(String(req.query.filCod), 10) : 2;

    if (isNaN(filCod) || filCod < 1 || filCod > 7) {
      return res.status(400).json({
        error: 'filCod inválido. Deve ser entre 1 e 7.'
      });
    }

    if (process.env.DEBUG_VERBOSE === '1') console.log(`[processes/for-export] ✓ Rota executada (filCod=${filCod})`);
    const result = await conexosService.getProcessesForExport(filCod);
    res.json({ source: 'conexos', data: result });
  } catch (err: any) {
    console.error('[processes/for-export] Error:', err.message);
    res.status(502).json({
      error: 'Erro ao buscar processos para exportação',
      details: err.message,
    });
  }
});

// GET /processes/with-contracts - processos que possuem contratos de câmbio
router.get('/with-contracts', async (_req, res) => {
  try {
    const result = await conexosService.getProcessesWithContractsEnriched();
    res.json({
      source: 'conexos',
      data: result,
    });
  } catch (err: any) {
    console.error('[processes/with-contracts] Error:', err.message);
    res.status(502).json({
      error: 'Erro ao buscar processos com contratos',
      details: err.message,
    });
  }
});

// GET /contracts - contratos de câmbio
router.get('/contracts', async (_req, res) => {
  try {
    const contracts = await conexosService.getContracts();
    res.json({ source: 'conexos', data: contracts });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar contratos do Conexos', details: err.message });
  }
});

// GET /processes - processos com possível relação a contratos
router.get('/', async (req, res) => {
  try {
    const { priCod, refExterna } = req.query;
    if (process.env.DEBUG_VERBOSE === '1') console.log('[processes route] Query params:', { priCod, refExterna });
    const filters: { priCod?: string; priEspRefcliente?: string } = {};

    if (priCod && typeof priCod === 'string') {
      filters.priCod = priCod;
    }
    if (refExterna && typeof refExterna === 'string') {
      filters.priEspRefcliente = refExterna;
    }

    if (process.env.DEBUG_VERBOSE === '1') console.log('[processes route] Filters being passed:', filters);
    const processes = await conexosService.getProcesses(Object.keys(filters).length > 0 ? filters : undefined);

    // Buscar cálculos existentes no Supabase
    let calculations: any[] = [];
    try {
      const { data: calculationsData, error } = await supabase
        .from('calculations')
        .select('id, processo_id, total_desembolso, calculated_at')
        .order('calculated_at', { ascending: false })
        .limit(500);
      if (error) {
        console.warn('Failed to fetch calculations from Supabase', error);
      } else {
        calculations = calculationsData || [];
      }
    } catch (err) {
      console.warn('Failed to fetch calculations from Supabase', err);
    }

    const calculatedProcessIds = new Set((calculations || []).map((c) => String(c.processo_id)));

    // Marcar processos que já possuem cálculos e anexar cálculos relacionados
    const processesWithCalcFlag = processes.map((p: any) => {
      const pid = String(p.imcCod || p.priCod || p.id || '');
      return {
        ...p,
        hasCalculation: calculatedProcessIds.has(pid),
        calculations: (calculations || []).filter((c: any) => String(c.processo_id) === pid),
      };
    });

    res.json({ source: 'conexos', data: { processes: processesWithCalcFlag, calculations } });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar processos do Conexos', details: err.message });
  }
});

// GET /processes/:priCod/contracts - contratos de câmbio por processo
router.get('/:priCod/contracts', async (req, res) => {
  try {
    const priCod = parseInt(req.params.priCod, 10);
    if (isNaN(priCod)) {
      return res.status(400).json({ error: 'priCod inválido' });
    }
    const contracts = await conexosService.getContractsByProcess(priCod);
    res.json({ source: 'conexos', data: contracts });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar contratos do Conexos', details: err.message });
  }
});

// GET /processes/:priCod/contracts/:imcCod/enriched - dados enriquecidos de um contrato
router.get('/:priCod/contracts/:imcCod/enriched', async (req, res) => {
  try {
    const priCod = parseInt(req.params.priCod, 10);
    const imcCod = parseInt(req.params.imcCod, 10);

    if (isNaN(priCod) || isNaN(imcCod)) {
      return res.status(400).json({ error: 'priCod ou imcCod inválido' });
    }

    const enriched = await conexosService.getEnrichedContractData(imcCod, priCod);
    res.json({ source: 'conexos', data: enriched });
  } catch (err: any) {
    res.status(502).json({
      error: 'Erro ao buscar contrato enriquecido',
      details: err.message
    });
  }
});

// GET /processes/:id/expenses - despesas do processo (api/imp021/DespesasProcesso)
router.get('/:id/expenses', async (req, res) => {
  try {
    const respExpenses = await conexosService.getDespesasByProcessId(req.params.id);
    const expenses = Array.isArray(respExpenses) ? respExpenses : (respExpenses?.rows || []);
    res.json({ source: 'conexos', data: expenses });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar despesas do processo', details: err.message });
  }
});

// GET /processes/:id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  if (id === 'all' || id === 'for-export' || id === 'with-contracts') {
    console.warn(`[processes] ROTA INCORRETA: /:id capturou "${id}" - a rota /${id} deveria ter sido usada. Verifique ordem das rotas.`);
    return res.status(400).json({
      error: 'Rota incorreta',
      details: `Use GET /processes/${id} (sem segmento dinâmico). Possível conflito de rotas.`,
    });
  }
  try {
    const processo = await conexosService.getProcessById(id);

    // Tentar buscar parcelas/movimentos do Conexos e títulos financeiros (para vencimento real)
    let payments: any[] = [];
    let parcelsError: string | null = null;
    try {
      const priCodNum = Number(id);
      const [rawParcels, financialTitles] = await Promise.all([
        conexosService.getParcelsByProcessId(id),
        !isNaN(priCodNum) ? conexosService.getFinancialTitlesPsq015(priCodNum) : Promise.resolve([])
      ]);

      const parcels = Array.isArray(rawParcels) ? rawParcels : rawParcels?.rows || [];
      const titles = Array.isArray(financialTitles) ? financialTitles : financialTitles?.rows || [];

      payments = parcels.map((p: any, idx: number) => {
        const dueDateVal = titles.length > 0 ? titles[0].titDtaVencimento : (p.pipDtaVcto || null);
        const paymentDateVal = p.borDtaMvto || p.bxaDtaBaixa || null;

        const toIso = (d: any) => {
          if (!d) return new Date().toISOString();
          if (typeof d === 'number') return new Date(d).toISOString();
          try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); }
        };

        return {
          id: p.pipCod ? String(p.pipCod) : `${id}-${idx}`,
          type: 'cambio',
          description: p.historico || p.descricao || p.hist || 'Parcela',
          value: Number(p.pipMnyValor || p.valorUSD || p.valor || 0) || 0,
          paymentDate: toIso(paymentDateVal),
          dueDate: toIso(dueDateVal),
          days: Number(p.diasCorridos || p.days || 0) || 0,
          interestRate: Number(p.txSpot || p.tx_spot || 0) || 0,
          calculatedInterest: Number(p.encargos || p.encargo || 0) || 0,
          titDtaVencimento: titles.length > 0 ? titles[0].titDtaVencimento : null
        };
      });
    } catch (innerErr: any) {
      // Não quebrar a rota se a busca de parcelas falhar; apenas logar
      console.warn('Failed to fetch parcels for process', id, innerErr?.message || innerErr);
      payments = [];
      parcelsError = innerErr?.response?.data ? JSON.stringify(innerErr.response.data) : (innerErr?.message || String(innerErr));
    }

    // Buscar despesas já existentes no Conexos
    let expenses: any[] = [];
    try {
      const respExpenses = await conexosService.getDespesasByProcessId(id);
      expenses = Array.isArray(respExpenses) ? respExpenses : (respExpenses?.rows || []);
    } catch (expErr) {
      console.warn('Failed to fetch expenses for process', id, expErr);
    }

    // Normalizar processo para a forma esperada pelo frontend, mantendo os campos originais
    const rawProcess = (processo && processo.body && Array.isArray(processo.body.rows) && processo.body.rows.length)
      ? processo.body.rows[0]
      : (Array.isArray(processo) && processo.length ? processo[0] : processo);

    // Buscar Incoterm via log009 (mesmo fluxo da tela principal)
    let incotermFromLog009 = null;
    const priCod = Number(rawProcess?.priCod || id);
    if (priCod) {
      try {
        const invCod = await conexosService.getInvoiceCodeLog009(priCod);
        if (invCod) {
          const log009Data = await conexosService.getProcessDetailsLog009(invCod);
          incotermFromLog009 = log009Data?.incEspSigla || null;
        }
      } catch (e) {
        console.warn('[GET /processes/:id] Erro ao buscar Incoterm via log009:', e);
      }
    }

    const normalizedProcess = {
      // manter todos os campos originais para compatibilidade
      ...rawProcess,
      id: String(rawProcess?.imcCod || rawProcess?.priCod || rawProcess?.id || id || ''),
      processNumber: rawProcess?.imcNumNumero || rawProcess?.priEspRefcliente || rawProcess?.priEspReferencia || rawProcess?.numero_processo || rawProcess?.priCod || '',
      clientName: rawProcess?.dpeNomPessoa || rawProcess?.dpeNomPessoaExp || rawProcess?.dpeNomPessoaCons || rawProcess?.clientName || '',
      incoterm: incotermFromLog009 || rawProcess?.incEspSigla || rawProcess?.incoterm || '',
      mercadoriasValue: Number(rawProcess?.vlrMneg || rawProcess?.vlrMnac || rawProcess?.valorUSD || 0) || 0,
      currency: rawProcess?.moeEspNome || 'USD',
      status: (rawProcess?.priVldStatus === '1' || rawProcess?.vldStatus === '1') ? 'pending' : 'pending',
      createdAt: rawProcess?.priDtaAbertura ? new Date(rawProcess.priDtaAbertura).toISOString() : (rawProcess?.imcDtaFechamento ? new Date(rawProcess.imcDtaFechamento).toISOString() : new Date().toISOString()),
      updatedAt: rawProcess?.priTimAlteracao ? new Date(rawProcess.priTimAlteracao).toISOString() : new Date().toISOString(),
      raw: rawProcess,
      expenses,
      hasExistingInterest: expenses.some((d: any) =>
        (d.impDesNome || d.ctpDesNome || '').toUpperCase().includes('ENCARGOS FINANCEIROS')
      ),
    };

    res.json({ source: 'conexos', data: { process: normalizedProcess, payments, parcelsError } });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar processo do Conexos', details: err.message });
  }
});

export default router;
