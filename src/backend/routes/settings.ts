import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

/** GET /settings — retorna todas as configurações como objeto key→value */
router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value');

  if (error) {
    res.status(502).json({ error: 'Erro ao buscar configurações', details: error.message });
    return;
  }

  const settings: Record<string, string> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  res.json({ data: settings });
});

/** PUT /settings — atualiza (upsert) um ou mais campos */
router.put('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, string>;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body deve ser um objeto key→value' });
    return;
  }

  const rows = Object.entries(body).map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    res.status(400).json({ error: 'Nenhum campo enviado' });
    return;
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) {
    res.status(502).json({ error: 'Erro ao salvar configurações', details: error.message });
    return;
  }

  res.json({ success: true });
});

export default router;
