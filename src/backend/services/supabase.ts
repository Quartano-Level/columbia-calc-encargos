import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Exemplo: salvar cálculo — mapear corretamente para colunas do banco
export async function saveCalculation(calculation: any, externalId?: string) {
  const row = {
    processo_id: String(calculation.processId ?? calculation.processoId ?? ''),
    cliente_id: calculation.clienteId ?? null,
    // guardar payload completo como jsonb (inclui movimentos, summary, etc.)
    payload: { ...calculation, _externalId: externalId },
    total_desembolso: Number(calculation.totalDisburse ?? calculation.summary?.totalDesembolso ?? 0) || 0,
    total_encargos: Number(calculation.totalCharges ?? 0) || 0,
    calculated_at: calculation.summary?.calculadoEm ? new Date(calculation.summary.calculadoEm) : new Date(),
    status: calculation.status ?? 'calculated',
  };

  return supabase.from('calculations').insert([row]);
}

// Exemplo: buscar cálculo — aceita tanto `id` (uuid) quanto `processo_id` (string/número)
export async function getCalculationById(id: string) {
  // Tentar por id (uuid)
  try {
    const byId = await supabase.from('calculations').select('*').eq('id', id).maybeSingle();
    if (byId && byId.data) return byId;
  } catch (err) {
    // pode falhar se `id` não for uuid (ex: '91'), continuar para buscar por processo_id
  }

  // Fallback: buscar pelo processo_id mais recente
  try {
    const byProcess = await supabase
      .from('calculations')
      .select('*')
      .eq('processo_id', String(id))
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return byProcess;
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getCalculationsList({ limit = 100, processId }: { limit?: number; processId?: string } = {}) {
  let query = supabase.from('calculations').select('*').order('calculated_at', { ascending: false }).limit(limit);
  if (processId) query = query.eq('processo_id', processId);
  return query;
}
