import { Router } from 'express';
import { conexosService } from '../services/conexos.js';

const router = Router();

// GET /filiais — retorna as filiais disponíveis (cache do login Conexos)
router.get('/', async (_req, res) => {
  try {
    await conexosService.ensureSid();
    const filiais = conexosService.getFiliais();
    res.json({ data: filiais });
  } catch (err: any) {
    res.status(502).json({ error: 'Erro ao buscar filiais', details: err.message });
  }
});

export default router;
