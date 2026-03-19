import { createClient } from '@supabase/supabase-js';
import { calculationPayloadHash } from '../utils/index.js';
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

// Salvar cálculo — auto-incrementa version por processo_id (RF-06)
export async function saveCalculation(calculation: any, externalId?: string) {
  const processoId = String(calculation.processId ?? calculation.processoId ?? '');

  // RF-06: Buscar versão anterior para auto-incrementar
  let version = 1;
  let previousCalculationId: string | null = null;
  try {
    const { data: prev } = await supabase
      .from('calculations')
      .select('id, version')
      .eq('processo_id', processoId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev) {
      version = (prev.version ?? 1) + 1;
      previousCalculationId = prev.id;
    }
  } catch (_) { /* primeira vez — version = 1 */ }

  const payloadObj = { ...calculation, _externalId: externalId };

  // Colunas base (sempre existem — migration 20251222)
  const baseRow = {
    processo_id: processoId,
    cliente_id: calculation.clienteId ?? null,
    payload: payloadObj,
    total_desembolso: Number(calculation.totalDisburse ?? 0) || 0,
    total_encargos: Number(calculation.totalInterest ?? 0) || 0,
    calculated_at: calculation.summary?.calculadoEm ? new Date(calculation.summary.calculadoEm) : new Date(),
    status: calculation.status ?? 'calculated',
    version,
    processo_numero: calculation.processoNumero ?? null,
    cliente_nome: calculation.clienteNome ?? null,
  };

  // Tentativa completa — inclui colunas das migrations RF-05/RF-06/RF-10
  const fullRow = {
    ...baseRow,
    previous_calculation_id: previousCalculationId,
    payload_hash: calculationPayloadHash(payloadObj),
  };

  return supabase.from('calculations').insert([fullRow]).select();
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

export async function updateCalculationStatus(id: string, status: string) {
  const updates: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (status === 'submitted') updates.submitted_at = new Date().toISOString();
  return supabase
    .from('calculations')
    .update(updates)
    .eq('id', id);
}

export async function saveSubmissionLog(log: {
  calculationId?: string;
  processoId: string;
  submittedBy?: string;
  requestPayload: Record<string, any>;
  responsePayload?: Record<string, any>;
  responseStatus?: number;
  conexosRecordId?: string;
}) {
  return supabase.from('calculation_submissions').insert([{
    calculation_id: log.calculationId ?? null,
    processo_id: log.processoId,
    submitted_by: log.submittedBy ?? null,
    request_payload: log.requestPayload,
    response_payload: log.responsePayload ?? null,
    response_status: log.responseStatus ?? null,
    conexos_record_id: log.conexosRecordId ?? null,
  }]);
}

export async function getCalculationsList({ limit = 100, processId }: { limit?: number; processId?: string } = {}) {
  let query = supabase.from('calculations').select('*').order('calculated_at', { ascending: false }).limit(limit);
  if (processId) query = query.eq('processo_id', processId);
  return query;
}

export type MonthlySummary = {
  month: string;       // "YYYY-MM"
  totalEncargos: number;
  count: number;
  submitted: number;
};

export async function getCalculationsSummary(months = 6): Promise<MonthlySummary[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('calculations')
    .select('total_encargos, calculated_at, status')
    .gte('calculated_at', from.toISOString())
    .order('calculated_at', { ascending: true });

  if (error) throw new Error(`DB error: ${error.message}`);

  const byMonth: Record<string, MonthlySummary> = {};
  for (const row of (data || [])) {
    const month = (row.calculated_at as string | null)?.substring(0, 7) ?? '';
    if (!month) continue;
    if (!byMonth[month]) byMonth[month] = { month, totalEncargos: 0, count: 0, submitted: 0 };
    byMonth[month].totalEncargos += Number(row.total_encargos || 0);
    byMonth[month].count += 1;
    if (row.status === 'submitted') byMonth[month].submitted += 1;
  }

  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
}
