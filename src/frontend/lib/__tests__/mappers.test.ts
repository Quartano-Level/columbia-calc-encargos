import { mapBackendToCalculationResult } from '../mappers';

describe('mapBackendToCalculationResult', () => {
  test('maps canonical payload unchanged and coerces values', () => {
    const raw = {
      movimentos: [
        { data: 1765756800000, historico: 'Pagamento FOB', total: '1000' }
      ],
      summary: { numeroMovimentos: 1, totalDesembolso: '1000', calculadoEm: '2025-12-22T00:00:00Z' },
      processoId: '123'
    } as any;

    const res = mapBackendToCalculationResult(raw as any);
    expect(res.processoId).toBe('123');
    expect(res.movimentos.length).toBe(1);
    expect(res.movimentos[0].total).toBe(1000);
    expect(res.summary.numeroMovimentos).toBe(1);
    expect(res.summary.totalDesembolso).toBe(1000);
  });

  test('maps legacy Conexos payload (movimentos with pipMnyValor/pipDtaVcto)', () => {
    const raw = {
      movimentos: [ { pipDtaVcto: 1765756800000, pipMnyValor: 220000, vlrMnac: 50000 } ],
      summary: {},
      processoId: 42
    } as any;

    const res = mapBackendToCalculationResult(raw as any);
    expect(res.processoId).toBe(42);
    expect(res.movimentos[0].valorUSD).toBe(220000);
    expect(res.movimentos[0].data).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    expect(res.summary.totalDesembolso).toBeGreaterThan(0);
  });
});
