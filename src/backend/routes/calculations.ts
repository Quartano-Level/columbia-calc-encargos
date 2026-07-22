import { Router } from 'express';
import { getCalculationById, getCalculationsList, getCalculationsSummary, updateCalculationStatus, saveSubmissionLog } from '../services/supabase.js';
import { logEvent, boxLog } from '../utils/index.js';

const router = Router();

// POST /calculate
import { orchestrateCalculation } from '../services/calculation.js';
import { conexosService } from '../services/conexos.js';
import { config } from '../config.js';
import { CalculationSavePayloadSchema } from '../types/schemas.js';

// Forma de rateio da despesa quando o encargo é rateado entre ODFs (Pernod).
// Observado numa despesa criada manualmente com rateio por ODF; validar no 1º envio real.
const FORMA_RETEIO_ODF = 7;
import { saveCalculation } from '../services/supabase.js';
import { calculationPayloadHash } from '../utils/index.js';

router.post('/', async (req, res) => {
  try {
    boxLog('Route: POST /calculations', req.body);
    const result = await orchestrateCalculation(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(422).json({ error: 'Erro ao calcular', details: err.message });
  }
});

// POST /calculations/save — salva payload v2 completo (por item) vindo do frontend
router.post('/save', async (req, res) => {
  try {
    const payload = CalculationSavePayloadSchema.parse(req.body);

    // Validar consistência: totalEncargos ≈ Σ items[].encargosCalculados
    const sumItems = payload.items.reduce((acc, item) => acc + item.encargosCalculados, 0);
    if (Math.abs(payload.totalEncargos - sumItems) > 0.01) {
      return res.status(422).json({
        error: 'Inconsistência no total de encargos',
        details: `totalEncargos (${payload.totalEncargos}) difere da soma dos itens (${sumItems.toFixed(2)})`,
      });
    }

    // Adaptar para saveCalculation() — mapeia campos do v2 para os nomes esperados
    const calcRow = {
      ...payload,
      totalDisburse: payload.totalValorBase,
      totalInterest: payload.totalEncargos,
      summary: { calculadoEm: payload.calculadoEm },
    };

    const { data: saved, error: saveError } = await saveCalculation(calcRow);
    if (saveError) {
      return res.status(500).json({ error: 'Erro ao salvar cálculo', details: saveError.message });
    }

    const row = (saved as any)?.[0];
    res.json({ id: row?.id, status: 'calculated', version: row?.version ?? 1 });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(422).json({ error: 'Payload inválido', details: err.issues ?? err.errors });
    }
    res.status(500).json({ error: 'Erro ao salvar cálculo', details: err.message });
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
    let filCod: number | undefined;
    let calculationId: string | undefined;

    if (data) {
      // Caminho 1: cálculo salvo no Supabase
      const row = data as any;
      const payload = row.payload || {};
      processId = row.processo_id || payload.processId || payload.processoId;
      emissionDate = req.body.emissionDate || payload.emissionDate || row.calculated_at || new Date().toISOString();
      totalInterest = Number(req.body.totalInterest) || payload.totalInterest || 0;
      taxaDolarFiscal = 1; // encargosCalculados já em BRL — sem conversão cambial aqui
      filCod = Number(req.body.filCod) || Number(payload.filCod) || undefined;
      calculationId = data.id;
    } else if (req.body && req.body.totalInterest) {
      // Caminho 2: dados enviados diretamente pelo frontend (calculador)
      processId = req.body.processId || req.params.id;
      emissionDate = req.body.emissionDate || new Date().toISOString();
      totalInterest = req.body.totalInterest;
      taxaDolarFiscal = req.body.taxaDolarFiscal || 1;
      filCod = Number(req.body.filCod) || undefined;
    } else {
      return res.status(404).json({
        error: 'Cálculo não encontrado',
        details: `Nenhum cálculo com id/processo '${req.params.id}' e nenhum dado enviado no body`
      });
    }

    // ODFs para rateio do encargo (Pernod). Vazio => sem rateio (fluxo padrão).
    const odfCods: number[] = Array.isArray(req.body?.odfCods)
      ? req.body.odfCods.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];
    const rateado = odfCods.length > 0;

    const submitPayload = {
      processId,
      emissionDate,
      totalInterest,
      taxaDolarFiscal,
      filCod,
      // Quando há rateio por ODF, a despesa é criada em modo abrangência (formaReteio=7).
      ...(rateado ? { formaReteio: FORMA_RETEIO_ODF } : {}),
    };
    boxLog('Submitting to Conexos', { ...submitPayload, odfCods });

    const conexosResponse = await conexosService.submitExpense(submitPayload);

    // Rateio: vincula a despesa recém-criada às ODFs selecionadas.
    // O pidCodSeq (e ctpCod/prjCod) vêm da resposta da criação da despesa.
    let rateioResponse: any = null;
    if (rateado) {
      const cr = (conexosResponse ?? {}) as any;
      const pidCodSeq = Number(cr.pidCodSeq);
      if (!Number.isFinite(pidCodSeq)) {
        throw new Error('Rateio por ODF: pidCodSeq ausente na resposta da criação da despesa (não é possível ratear).');
      }
      rateioResponse = await conexosService.rateioDespesaOdf({
        filCod: Number(cr.filCod ?? filCod ?? config.conexos.filCod),
        priCod: cr.priCod ?? processId,
        ctpCod: Number(cr.ctpCod ?? config.conexos.ctpCod),
        prjCod: Number(cr.prjCod ?? 1),
        pidCodSeq,
        odfCods,
      });
    }

    // RF-04: Atualizar status no banco após submissão com sucesso
    if (calculationId) {
      await updateCalculationStatus(calculationId, 'submitted');
    }

    // RF-05: Trilha de auditoria da submissão
    await saveSubmissionLog({
      calculationId: calculationId || undefined,
      processoId: String(processId),
      requestPayload: { ...submitPayload, odfCods },
      responsePayload: { despesa: conexosResponse ?? {}, rateio: rateioResponse },
      responseStatus: 200,
    });

    logEvent('calculation_submitted', { calculationId: calculationId || processId });

    res.json({ status: 'submitted', calculationId: calculationId || processId, conexosResponse, rateioResponse, odfCods });
  } catch (err: any) {
    boxLog('Submission Error', { error: err.message, data: err.response?.data });
    res.status(500).json({ error: 'Erro ao submeter cálculo', details: err.message });
  }
});

export default router;
