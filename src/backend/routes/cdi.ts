import { Router } from 'express';

const router = Router();

// GET /cdi
import { conexosService } from '../services/conexos.js';

router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const start = (startDate || date) as string | undefined;
    const end = endDate as string | undefined;
    const cdi = await conexosService.getCDI(start, end);
    res.json({ source: 'conexos', data: cdi });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar CDI do Conexos', details: err.message });
  }
});

export default router;
