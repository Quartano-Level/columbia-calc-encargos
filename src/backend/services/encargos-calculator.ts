/**
 * Módulo canônico de cálculo de encargos financeiros.
 *
 * Metodologia oficial: juros simples (linear) sobre base de dias corridos.
 * Fórmula: Encargo = Valor × (taxaAnual / base / 100) × diasCorridos
 *
 * CDI composto (fator acumulado BCB) é usado exclusivamente para
 * cálculo de juros perdidos em títulos pagos em atraso — ver cdi-calculator.ts.
 */

/**
 * Converte taxa anual percentual em taxa diária decimal.
 *
 * @param taxaAnual   Taxa anual em percentual (ex: 12.65 para 12,65% a.a.)
 * @param base        Base de dias do ano (360 corridos ou 252 úteis). Padrão: 360.
 * @returns           Taxa diária decimal (ex: 0.000351388...)
 */
export function convertAnualParaDiario(taxaAnual: number, base: 360 | 252 = 360): number {
  return taxaAnual / base / 100;
}

/**
 * Calcula encargos financeiros pelo método simples (linear).
 *
 * Encargo = Valor × (taxaAnual / base / 100) × diasCorridos
 *
 * Exemplo: Valor=1.000.000, CDI=12,65%aa, 30 dias → R$ 10.541,67
 *
 * @param valor          Valor principal em BRL
 * @param taxaAnual      Taxa anual em percentual (ex: 12.65)
 * @param diasCorridos   Número de dias corridos do contrato
 * @param base           Base de dias do ano. Padrão: 360.
 * @returns              Encargo calculado em BRL (≥ 0)
 */
export function calcEncargosSimples(
  valor: number,
  taxaAnual: number,
  diasCorridos: number,
  base: 360 | 252 = 360,
): number {
  if (valor <= 0 || taxaAnual <= 0 || diasCorridos <= 0) return 0;
  return valor * convertAnualParaDiario(taxaAnual, base) * diasCorridos;
}

/**
 * Calcula encargos financeiros pelo método composto (usando fator acumulado BCB).
 * Usado para juros perdidos em títulos pagos em atraso.
 *
 * Encargo = Valor × (fatorAcumulado - 1)
 *
 * @param valor           Valor principal em BRL
 * @param fatorAcumulado  Fator CDI acumulado (ex: 1.0053 para 0,53% no período)
 * @returns               Juros acumulados em BRL (≥ 0)
 */
export function calcEncargosCompostos(valor: number, fatorAcumulado: number): number {
  if (valor <= 0 || fatorAcumulado <= 1) return 0;
  return valor * (fatorAcumulado - 1);
}
