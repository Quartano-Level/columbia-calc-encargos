import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
