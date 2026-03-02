import { Router } from 'express';
import { conexosService } from '../services/conexos.js';

const router = Router();

/** GET /com299/valor-permutar — soma de mnyTitPermutar para INOX Tech (pesCod=191) */
router.get('/valor-permutar', async (_req, res) => {
  try {
    const valorPermutar = await conexosService.getValorPermutar();
    console.log('[com299/valor-permutar] OK:', valorPermutar);
    res.json({ data: { valorPermutar } });
  } catch (err: any) {
    console.error('[com299/valor-permutar] Error:', err.message);
    console.error('[com299/valor-permutar] Stack:', err.stack);
    res.status(502).json({ error: 'Erro ao buscar valor a permutar', details: err.message });
  }
});

/** GET /com299/list — lista completa com299 (docCod + colunas financeiras) para INOX Tech */
router.get('/list', async (_req, res) => {
  try {
    const rows = await conexosService.getCom299List();
    res.json({ data: { rows } });
  } catch (err: any) {
    console.error('[com299/list] Error:', err.message);
    res.status(502).json({ error: 'Erro ao buscar lista com299', details: err.message });
  }
});

export default router;
