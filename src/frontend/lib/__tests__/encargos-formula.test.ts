import { calcularEncargos, calcularVariacaoCambial } from '../utils';

describe('calcularEncargos', () => {
  // Caso canônico validado manualmente:
  // Valor = R$ 1.000.000 | CDI = 12,65% a.a. | Prazo = 30 dias
  // → 1.000.000 × (12,65 / 360 / 100) × 30 = R$ 10.541,67
  it('calcula corretamente para valor grande (1M, CDI 12.65%, 30 dias)', () => {
    const resultado = calcularEncargos(1_000_000, 12.65, 30);
    expect(resultado).toBeCloseTo(10_541.67, 0);
  });

  it('calcula corretamente para valor pequeno (R$ 5.000, CDI 10.5%, 15 dias)', () => {
    // 5000 × (10.5 / 360 / 100) × 15 = 5000 × 0.000291667 × 15 = 21.875
    const resultado = calcularEncargos(5_000, 10.5, 15);
    expect(resultado).toBeCloseTo(21.875, 2);
  });

  it('retorna 0 quando prazo é zero', () => {
    expect(calcularEncargos(1_000_000, 12.65, 0)).toBe(0);
  });

  it('retorna 0 quando valor é zero', () => {
    expect(calcularEncargos(0, 12.65, 30)).toBe(0);
  });

  it('retorna 0 quando CDI é zero', () => {
    expect(calcularEncargos(1_000_000, 0, 30)).toBe(0);
  });

  it('resultado é proporcional ao prazo (linear)', () => {
    const enc30 = calcularEncargos(100_000, 12.65, 30);
    const enc60 = calcularEncargos(100_000, 12.65, 60);
    expect(enc60).toBeCloseTo(enc30 * 2, 5);
  });

  describe('base de dias', () => {
    it('base 360 (padrão) e base 252 produzem resultados diferentes', () => {
      const enc360 = calcularEncargos(1_000_000, 12.65, 30, 360);
      const enc252 = calcularEncargos(1_000_000, 12.65, 30, 252);
      // Base 252 → mais dias úteis → taxa diária maior → encargo maior
      expect(enc252).toBeGreaterThan(enc360);
    });

    it('base 252: 1M, CDI 12.65%, 30 dias → 1.000.000 × (12.65/252/100) × 30', () => {
      // 1.000.000 × (12.65 / 252 / 100) × 30 = 15.059,52...
      const resultado = calcularEncargos(1_000_000, 12.65, 30, 252);
      expect(resultado).toBeCloseTo(15_059.52, 0);
    });

    it('sem base explícita usa 360 (compatibilidade retroativa)', () => {
      const semBase = calcularEncargos(1_000_000, 12.65, 30);
      const comBase360 = calcularEncargos(1_000_000, 12.65, 30, 360);
      expect(semBase).toBe(comBase360);
    });
  });
});

describe('calcularVariacaoCambial', () => {
  // Fórmula: Variação Cambial = Valor USD × (Ptax DI - Taxa Fechamento)

  it('retorna perda cambial (positivo) quando Ptax DI > Taxa Fechamento', () => {
    // 1.000.000 USD × (5.20 - 5.00) = 200.000 BRL
    const resultado = calcularVariacaoCambial(1_000_000, 5.20, 5.00);
    expect(resultado).toBeCloseTo(200_000, 2);
  });

  it('retorna ganho cambial (negativo) quando Ptax DI < Taxa Fechamento', () => {
    // 1.000.000 USD × (4.80 - 5.00) = -200.000 BRL
    const resultado = calcularVariacaoCambial(1_000_000, 4.80, 5.00);
    expect(resultado).toBeCloseTo(-200_000, 2);
  });

  it('retorna zero quando taxas são iguais (sem variação)', () => {
    expect(calcularVariacaoCambial(1_000_000, 5.00, 5.00)).toBe(0);
  });

  it('retorna zero quando valorUSD é zero', () => {
    expect(calcularVariacaoCambial(0, 5.20, 5.00)).toBe(0);
  });

  it('retorna zero quando ptaxDI é zero (dado inválido)', () => {
    expect(calcularVariacaoCambial(1_000_000, 0, 5.00)).toBe(0);
  });

  it('retorna zero quando taxaFechamento é zero (dado inválido)', () => {
    expect(calcularVariacaoCambial(1_000_000, 5.20, 0)).toBe(0);
  });

  it('é proporcional ao valor USD', () => {
    const metade = calcularVariacaoCambial(500_000, 5.20, 5.00);
    const inteiro = calcularVariacaoCambial(1_000_000, 5.20, 5.00);
    expect(inteiro).toBeCloseTo(metade * 2, 5);
  });

  it('variação de 1 centavo por dólar em 100k USD = R$ 1.000', () => {
    // 100.000 × (5.01 - 5.00) = 1.000 BRL
    const resultado = calcularVariacaoCambial(100_000, 5.01, 5.00);
    expect(resultado).toBeCloseTo(1_000, 2);
  });
});
