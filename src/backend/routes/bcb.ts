import { Router, Request, Response } from 'express';
import { bcbService } from '../services/bcb.js';

const router = Router();

/** GET /bcb/cdi/latest — Última taxa CDI anualizada */
router.get('/cdi/latest', async (_req: Request, res: Response) => {
  try {
    const data = await bcbService.getLatestCDI();
    res.json({ source: 'bcb', data });
  } catch (err: any) {
    console.error('[BCB Route] /cdi/latest error:', err.message);
    res.status(502).json({ error: 'Falha ao buscar CDI do Banco Central', details: err.message });
  }
});

/** GET /bcb/cdi?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — Taxas CDI diárias no período */
router.get('/cdi', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Parâmetros startDate e endDate são obrigatórios (formato YYYY-MM-DD)' });
      return;
    }
    const data = await bcbService.getCDIDaily(String(startDate), String(endDate));
    res.json({ source: 'bcb', count: data.length, data });
  } catch (err: any) {
    console.error('[BCB Route] /cdi error:', err.message);
    res.status(502).json({ error: 'Falha ao buscar taxas CDI do Banco Central', details: err.message });
  }
});

/** GET /bcb/cdi/accumulated?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — Fator acumulado CDI */
router.get('/cdi/accumulated', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Parâmetros startDate e endDate são obrigatórios (formato YYYY-MM-DD)' });
      return;
    }
    const { factor, days } = await bcbService.getAccumulatedFactor(String(startDate), String(endDate));
    res.json({
      source: 'bcb',
      data: { factor, days, startDate: String(startDate), endDate: String(endDate) },
    });
  } catch (err: any) {
    console.error('[BCB Route] /cdi/accumulated error:', err.message);
    res.status(502).json({ error: 'Falha ao calcular fator acumulado CDI', details: err.message });
  }
});

export default router;
