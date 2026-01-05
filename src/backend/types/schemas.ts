import { z } from 'zod';

export const CalculationResultSchema = z.object({
  processId: z.string(),
  clienteId: z.string(),
  custosUSD: z.object({
    fobTotal: z.number(),
    freteTotal: z.number(),
    seguroTotal: z.number(),
    cifTotal: z.number(),
  }),
  cambio: z.object({
    cdiAM: z.number(),
    txSpotCompra: z.number(),
    txFuturaVenc: z.number(),
    taxaDolarFiscal: z.number(),
    valorCIFbrl: z.number(),
  }),
  impostos: z.any(),
  creditos: z.any(),
  despesas: z.any(),
  encargos: z.any(),
  custos: z.any(),
  precos: z.any(),
  movimentos: z.array(z.object({
    data: z.string(),
    historico: z.string(),
    diasCorridos: z.number(),
    txSpot: z.number(),
    valorUSD: z.number(),
    encargos: z.number(),
    total: z.number(),
  })),
  summary: z.object({
    numeroMovimentos: z.number(),
    totalDesembolso: z.number(),
    calculadoEm: z.string(),
  }),
});
