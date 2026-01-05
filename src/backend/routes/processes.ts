import { Router } from 'express';

const router = Router();

// GET /processes

import { conexosService } from '../services/conexos.js';
import { supabase } from '../services/supabase.js';

// GET /contracts - contratos de câmbio
router.get('/contracts', async (_req, res) => {
  try {
    const contracts = await conexosService.getContracts();
    res.json({ source: 'conexos', data: contracts });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar contratos do Conexos', details: err.message });
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

// GET /processes - processos com possível relação a contratos
router.get('/', async (req, res) => {
  try {
    const { priCod, refExterna } = req.query;
    console.log('[processes route] Query params:', { priCod, refExterna });
    const filters: { priCod?: string; priEspRefcliente?: string } = {};

    if (priCod && typeof priCod === 'string') {
      filters.priCod = priCod;
    }
    if (refExterna && typeof refExterna === 'string') {
      filters.priEspRefcliente = refExterna;
    }

    console.log('[processes route] Filters being passed:', filters);
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

// GET /processes/:id
router.get('/:id', async (req, res) => {
  try {
    const processo = await conexosService.getProcessById(req.params.id);

    // Tentar buscar parcelas/movimentos do Conexos e mapear para formato expected pelo frontend
    let payments: any[] = [];
    let parcelsError: string | null = null;
    try {
      const rawParcels = await conexosService.getParcelsByProcessId(req.params.id);
      // Conexos pode retornar { rows: [...] } ou array direto
      const parcels = Array.isArray(rawParcels) ? rawParcels : rawParcels?.rows || [];

      payments = parcels.map((p: any, idx: number) => {
        const dateVal = p.pipDtaVcto || p.data || p.dta || p.dtaVcto || null;
        // Se for timestamp numérico, converter para ISO string
        const toIso = (d: any) => {
          if (!d) return new Date().toISOString();
          if (typeof d === 'number') return new Date(d).toISOString();
          // Strings podem estar em formato ISO já
          return new Date(d).toISOString();
        };

        return {
          id: p.pipCod ? String(p.pipCod) : `${req.params.id}-${idx}`,
          type: 'cambio',
          description: p.historico || p.descricao || p.hist || 'Parcela',
          value: Number(p.pipMnyValor || p.valorUSD || p.valor || 0) || 0,
          paymentDate: toIso(dateVal),
          dueDate: toIso(dateVal),
          days: Number(p.diasCorridos || p.days || 0) || 0,
          interestRate: Number(p.txSpot || p.tx_spot || 0) || 0,
          calculatedInterest: Number(p.encargos || p.encargo || 0) || 0,
        };
      });
    } catch (innerErr: any) {
      // Não quebrar a rota se a busca de parcelas falhar; apenas logar
      console.warn('Failed to fetch parcels for process', req.params.id, innerErr?.message || innerErr);
      payments = [];
      parcelsError = innerErr?.response?.data ? JSON.stringify(innerErr.response.data) : (innerErr?.message || String(innerErr));
    }

    // Normalizar processo para a forma esperada pelo frontend, mantendo os campos originais
    const rawProcess = (processo && processo.body && Array.isArray(processo.body.rows) && processo.body.rows.length)
      ? processo.body.rows[0]
      : (Array.isArray(processo) && processo.length ? processo[0] : processo);

    // Buscar Incoterm via log009 (mesmo fluxo da tela principal)
    let incotermFromLog009 = null;
    const priCod = Number(rawProcess?.priCod || req.params.id);
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
      id: String(rawProcess?.imcCod || rawProcess?.priCod || rawProcess?.id || req.params.id || ''),
      processNumber: rawProcess?.imcNumNumero || rawProcess?.priEspRefcliente || rawProcess?.priEspReferencia || rawProcess?.numero_processo || rawProcess?.priCod || '',
      clientName: rawProcess?.dpeNomPessoa || rawProcess?.dpeNomPessoaExp || rawProcess?.dpeNomPessoaCons || rawProcess?.clientName || '',
      incoterm: incotermFromLog009 || rawProcess?.incEspSigla || rawProcess?.incoterm || '',
      mercadoriasValue: Number(rawProcess?.vlrMneg || rawProcess?.vlrMnac || rawProcess?.valorUSD || 0) || 0,
      currency: rawProcess?.moeEspNome || 'USD',
      status: (rawProcess?.priVldStatus === '1' || rawProcess?.vldStatus === '1') ? 'pending' : 'pending',
      createdAt: rawProcess?.priDtaAbertura ? new Date(rawProcess.priDtaAbertura).toISOString() : (rawProcess?.imcDtaFechamento ? new Date(rawProcess.imcDtaFechamento).toISOString() : new Date().toISOString()),
      updatedAt: rawProcess?.priTimAlteracao ? new Date(rawProcess.priTimAlteracao).toISOString() : new Date().toISOString(),
      raw: rawProcess,
    };

    res.json({ source: 'conexos', data: { process: normalizedProcess, payments, parcelsError } });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar processo do Conexos', details: err.message });
  }
});

export default router;
