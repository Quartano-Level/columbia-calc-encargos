import { CalculationResult } from '../types';

// Função para calcular hash do input para idempotência
import crypto from 'crypto';
export function calculationInputHash(input: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// Função para logging estruturado
export function logEvent(event: string, data: any) {
  // TODO: Integrar com serviço de logging real
  console.log(`[${new Date().toISOString()}] ${event}:`, data);
}

// Quando true, exibe logs verbosos (boxLog, etapas de fluxo, etc). Por padrão false para não poluir o terminal.
export const DEBUG_VERBOSE = process.env.DEBUG_VERBOSE === '1' || process.env.DEBUG_VERBOSE === 'true';

// Logging estético e organizado (só exibe quando DEBUG_VERBOSE=1)
export function boxLog(title: string, data: any) {
  if (!DEBUG_VERBOSE) return;
  const line = "=".repeat(50);
  console.log(`\n${line}`);
  console.log(`[ ${title.toUpperCase()} ]`);
  console.log(line);
  console.log(JSON.stringify(data, null, 2));
  console.log(`${line}\n`);
}
