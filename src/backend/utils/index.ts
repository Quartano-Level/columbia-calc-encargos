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

// Logging estético e organizado
export function boxLog(title: string, data: any) {
  const line = "=".repeat(50);
  console.log(`\n${line}`);
  console.log(`[ ${title.toUpperCase()} ]`);
  console.log(line);
  console.log(JSON.stringify(data, null, 2));
  console.log(`${line}\n`);
}
