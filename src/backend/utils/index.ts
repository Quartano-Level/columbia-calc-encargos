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
