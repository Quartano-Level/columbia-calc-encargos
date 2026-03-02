import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calcula o encargo financeiro de um contrato de câmbio a prazo.
 *
 * Fórmula: Encargo = Valor × (CDI_ao_ano / base / 100) × Prazo_em_dias
 *
 * Exemplo: Valor = R$ 1.000.000, CDI = 12,65% a.a., Prazo = 30 dias, base = 360
 *   → 1.000.000 × (12,65 / 360 / 100) × 30 = R$ 10.541,67
 *
 * @param valor           Valor principal em BRL
 * @param cdiAoAno        CDI anual em percentual (ex: 12.65, não 0.1265)
 * @param prazoEmDias     Prazo do contrato em dias corridos
 * @param base            Base de dias do ano: 360 corridos ou 252 úteis (padrão: 360)
 * @returns               Encargo calculado em BRL (≥ 0)
 */
export function calcularEncargos(
  valor: number,
  cdiAoAno: number,
  prazoEmDias: number,
  base: 360 | 252 = 360,
): number {
  if (prazoEmDias <= 0 || valor <= 0 || cdiAoAno <= 0) return 0;
  return valor * (cdiAoAno / base / 100) * prazoEmDias;
}

/**
 * Calcula a variação cambial de um contrato de câmbio.
 *
 * Fórmula: Variação Cambial = Valor USD × (Ptax DI - Taxa Fechamento)
 * - Resultado positivo: Ptax DI > Taxa Fechamento → dólar ficou mais caro (perda cambial)
 * - Resultado negativo: Ptax DI < Taxa Fechamento → dólar ficou mais barato (ganho cambial)
 * - Resultado zero: taxas iguais → sem variação
 *
 * @param valorUSD       Valor do contrato em moeda estrangeira (USD, EUR etc.)
 * @param ptaxDI         Taxa Ptax na data da Declaração de Importação (embarque)
 * @param taxaFechamento Taxa do contrato de câmbio (imcFltTxFec)
 * @returns              Variação cambial em BRL (positiva = perda, negativa = ganho; 0 se dados inválidos)
 */
export function calcularVariacaoCambial(
  valorUSD: number,
  ptaxDI: number,
  taxaFechamento: number,
): number {
  if (valorUSD <= 0 || ptaxDI <= 0 || taxaFechamento <= 0) return 0;
  return valorUSD * (ptaxDI - taxaFechamento);
}

/**
 * Formata um número exibindo todas as casas decimais significativas.
 * Remove zeros à direita desnecessários, mas mantém a precisão do valor original.
 * @param value - O número a ser formatado
 * @param minDecimals - Mínimo de casas decimais a exibir (padrão: 0)
 * @param maxDecimals - Máximo de casas decimais a exibir (padrão: 20)
 * @returns String formatada do número
 */
export function formatSignificantDigits(
  value: number | string | null | undefined,
  minDecimals = 0,
  maxDecimals = 20
): string {
  if (value === null || value === undefined || value === '') return '—';

  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';

  // Converte para string com máxima precisão
  const str = num.toFixed(maxDecimals);

  // Remove zeros à direita, mantendo pelo menos minDecimals
  const parts = str.split('.');
  if (parts.length === 1) {
    return minDecimals > 0 ? `${parts[0]}.${'0'.repeat(minDecimals)}` : parts[0];
  }

  let decimals = parts[1];

  // Remove zeros à direita
  while (decimals.length > minDecimals && decimals.endsWith('0')) {
    decimals = decimals.slice(0, -1);
  }

  return decimals.length > 0 ? `${parts[0]}.${decimals}` : parts[0];
}

/**
 * Formata uma taxa/percentual exibindo todas as casas significativas.
 * @param value - O valor da taxa
 * @param suffix - Sufixo a adicionar (padrão: '%')
 * @returns String formatada da taxa com sufixo
 */
export function formatRate(
  value: number | string | null | undefined,
  suffix = '%'
): string {
  const formatted = formatSignificantDigits(value, 0, 20);
  return formatted === '—' ? formatted : `${formatted}${suffix}`;
}
