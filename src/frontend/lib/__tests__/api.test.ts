import { calculateCharges } from '../api';

// Mock global fetch
global.fetch = jest.fn();

describe('calculateCharges API integration', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  test('handles canonical n8n response', async () => {
    const fakeResponse = {
      body: {
        totalDisburse: 1000,
        payments: [ { id: 'p1', value: 1000, paymentDate: '2025-12-01', description: 'Pagamento' } ],
        summary: { calculationDate: '2025-12-22T00:00:00Z', taxaCDI: 5.5 }
      }
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => fakeResponse });

    const res = await calculateCharges('proc-1', { processId: 'proc-1' } as any);
    expect(res.totalDisburse).toBe(1000);
    expect(res.payments.length).toBe(1);
    expect(res.summary.taxaCDI).toBe(5.5);
  });

  test('maps legacy backend response', async () => {
    const fakeResponse = {
      custos: { custoTotalImportacao: 2000 },
      encargos: { total: 200 },
      movimentos: [ { data: 1765756800000, historico: 'Pagamento FOB', total: 2000 } ],
      summary: { calculadoEm: '2025-12-22T00:00:00Z' },
      cambio: { cdiAM: 5.5, txSpotCompra: 5.2 }
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => fakeResponse });

    const res = await calculateCharges('proc-2', { processId: 'proc-2' } as any);
    expect(res.totalDisburse).toBeGreaterThan(0);
    expect(res.payments.length).toBeGreaterThan(0);
    expect(res.summary.taxaCDI).toBe(5.5);
  });
});
