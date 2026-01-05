import { Router } from 'express';

const router = Router();

// GET /cdi
import { conexosService } from '../services/conexos.js';

router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const dateStr = date && typeof date === 'string' ? date : undefined;
    const cdi = await conexosService.getCDI(dateStr);
    res.json({ source: 'conexos', data: cdi });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar CDI do Conexos', details: err.message });
  }
});

export default router;
