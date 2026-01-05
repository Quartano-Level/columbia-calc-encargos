import { Router } from 'express';
import { getCalculationById, getCalculationsList } from '../services/supabase.js';
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
    // Buscar cálculo (aceita id uuid ou processo_id)
    const { data, error } = await getCalculationById(req.params.id);
    if (error || !data) {
      return res.status(404).json({ error: 'Cálculo não encontrado', details: error?.message || `Nenhum cálculo com id/processo '${req.params.id}'` });
    }
    // 2. Chamar Conexos para inserir a despesa
    const row = data as any;
    const payload = row.payload || {};

    const processId = row.processo_id || payload.processId || payload.processoId;
    const emissionDate = payload.emissionDate || row.calculated_at || new Date().toISOString();

    // Priorizar totalInterest do payload, senao usar total_encargos da coluna
    const totalInterest = payload.totalInterest || row.total_encargos || 0;

    // Taxa cambial está no objeto cambio do payload
    const taxaDolarFiscal = payload.cambio?.taxaDolarFiscal || 1;

    boxLog('Submitting to Conexos', { processId, emissionDate, totalInterest, taxaDolarFiscal });

    await conexosService.submitExpense({
      processId,
      emissionDate,
      totalInterest,
      taxaDolarFiscal
    });

    // 3. Registrar submissão no Supabase (usar id real do cálculo)
    logEvent('calculation_submitted', { calculationId: data.id });

    // Opcional: Atualizar status do cálculo para 'submitted'
    // await updateCalculationStatus(data.id, 'submitted');

    res.json({ status: 'submitted', calculationId: data.id });
  } catch (err: any) {
    boxLog('Submission Error', { error: err.message, data: err.response?.data });
    res.status(500).json({ error: 'Erro ao submeter cálculo', details: err.message });
  }
});

export default router;
