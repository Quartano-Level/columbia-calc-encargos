import { Router } from 'express';
import { getCalculationById, getCalculationsList, getCalculationsSummary } from '../services/supabase.js';
import { logEvent, boxLog } from '../utils/index.js';

const router = Router();

// POST /calculate
import { orchestrateCalculation } from '../services/calculation.js';
import { conexosService } from '../services/conexos.js';

router.post('/', async (req, res) => {
  try {
    boxLog('Route: POST /calculations', req.body);
    const result = await orchestrateCalculation(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(422).json({ error: 'Erro ao calcular', details: err.message });
  }
});

// GET /calculations/summary?months=6
router.get('/summary', async (req, res) => {
  try {
    const months = Math.min(Number(req.query.months) || 6, 24);
    const data = await getCalculationsSummary(months);
    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar resumo mensal', details: err.message });
  }
});

// GET /calculations
router.get('/', async (req, res) => {
  try {
    const { limit, processId } = req.query;
    const l = Number(limit) || 100;
    const { data, error } = await getCalculationsList({ limit: l, processId: typeof processId === 'string' ? processId : undefined });
    if (error) return res.status(500).json({ error: 'Erro ao buscar lista de cálculos', details: error.message });
    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar lista de cálculos', details: err.message });
  }
});

// GET /calculations/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await getCalculationById(req.params.id);
    if (error || !data) {
      return res.status(404).json({ error: 'Cálculo não encontrado', details: error?.message });
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar cálculo', details: err.message });
  }
});

// POST /calculations/:id/submit
router.post('/:id/submit', async (req, res) => {
  try {
    const { data } = await getCalculationById(req.params.id);

    let processId: string;
    let emissionDate: string;
    let totalInterest: number;
    let taxaDolarFiscal: number;
    let calculationId: string | undefined;

    if (data) {
      // Caminho 1: cálculo salvo no Supabase
      const row = data as any;
      const payload = row.payload || {};
      processId = row.processo_id || payload.processId || payload.processoId;
      emissionDate = payload.emissionDate || row.calculated_at || new Date().toISOString();
      totalInterest = payload.totalInterest || row.total_encargos || 0;
      taxaDolarFiscal = payload.cambio?.taxaDolarFiscal || 1;
      calculationId = data.id;
    } else if (req.body && req.body.totalInterest) {
      // Caminho 2: dados enviados diretamente pelo frontend (calculador)
      processId = req.body.processId || req.params.id;
      emissionDate = req.body.emissionDate || new Date().toISOString();
      totalInterest = req.body.totalInterest;
      taxaDolarFiscal = req.body.taxaDolarFiscal || 1;
    } else {
      return res.status(404).json({
        error: 'Cálculo não encontrado',
        details: `Nenhum cálculo com id/processo '${req.params.id}' e nenhum dado enviado no body`
      });
    }

    boxLog('Submitting to Conexos', { processId, emissionDate, totalInterest, taxaDolarFiscal });

    await conexosService.submitExpense({
      processId,
      emissionDate,
      totalInterest,
      taxaDolarFiscal
    });

    logEvent('calculation_submitted', { calculationId: calculationId || processId });

    res.json({ status: 'submitted', calculationId: calculationId || processId });
  } catch (err: any) {
    boxLog('Submission Error', { error: err.message, data: err.response?.data });
    res.status(500).json({ error: 'Erro ao submeter cálculo', details: err.message });
  }
});

export default router;
