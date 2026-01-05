import { Router } from 'express';
import { getCalculationById, getCalculationsList } from '../services/supabase.js';
import { logEvent } from '../utils/index.js';

const router = Router();

// POST /calculate
import { orchestrateCalculation } from '../services/calculation.js';

router.post('/', async (req, res) => {
  try {
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
    // TODO: Submeter ao Conecta/SAP via Conexos (mock)
    // await conexosService.submitCalculation(data);
    // Registrar submissão no Supabase (usar id real do cálculo)
    logEvent('calculation_submitted', { calculationId: data.id });
    res.json({ status: 'submitted', calculationId: data.id });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao submeter cálculo', details: err.message });
  }
});

export default router;
