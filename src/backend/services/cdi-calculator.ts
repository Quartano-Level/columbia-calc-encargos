import { conexosService } from './conexos.js';
import { boxLog } from '../utils/index.js';

export class CDICalculatorService {
    /**
     * Calcula o fator acumulado do CDI para um intervalo de datas (capitalização composta).
     * @param startDate Data de início (Vencimento - exclusive)
     * @param endDate Data de fim (Pagamento - inclusive)
     * @returns Fator acumulado (ex: 1.0005)
     */
    async getAccumulatedFactor(startDate: string, endDate: string): Promise<number> {
        boxLog('CDICalculator: getAccumulatedFactor', { startDate, endDate });

        if (new Date(startDate) >= new Date(endDate)) {
            return 1;
        }

        // Buscar taxas CDI no período
        // Nota: getCDI do ConexosService usa GE (>=) e LE (<=)
        // Para o cálculo de atraso, se venceu dia 1 e pagou dia 5, 
        // as taxas são dos dias 2, 3, 4 e 5.

        const start = new Date(startDate);
        start.setUTCDate(start.getUTCDate() + 1); // Dia seguinte ao vencimento
        const startIso = start.toISOString().split('T')[0];

        const cdiData = await conexosService.getCDI(startIso, endDate);
        const rows = Array.isArray(cdiData) ? cdiData : (cdiData?.rows || []);

        if (rows.length === 0) {
            console.warn(`[CDICalculator] Nenhuma taxa CDI encontrada entre ${startIso} e ${endDate}`);
            return 1;
        }

        // Ordenar por data ascendente para garantir
        rows.sort((a: any, b: any) => (a.ftxDtaTaxa || 0) - (b.ftxDtaTaxa || 0));

        // Capitalização Composta: Produto(1 + taxa/100)
        let accumulatedFactor = 1;
        for (const row of rows) {
            const dailyRate = Number(row.ftxNumFatDiario);
            if (!isNaN(dailyRate) && dailyRate > 0) {
                // A taxa no Conexos costuma vir como 0.043210 (já em formato decimal ou percentual?)
                // ftxNumFatDiario geralmente é o fator diário direto (ex: 0.00045) ou a taxa (0.045)
                // Se for fator diário: fator = 1 + dailyRate
                // Se for taxa percentual: fator = 1 + (dailyRate / 100)
                // Verificando implementação prévia em calculation.ts: 
                // "encargos = valorUSD * (cdiDiario / 100) * (dias || 0);" -> indica que é taxa percentual.
                accumulatedFactor *= (1 + (dailyRate / 100));
            }
        }

        return accumulatedFactor;
    }

    /**
     * Calcula o valor dos juros perdidos.
     * @param principal Valor base (BRL)
     * @param startDate Data de vencimento
     * @param endDate Data de pagamento
     */
    async calculateLostInterest(principal: number, startDate: string, endDate: string): Promise<{
        lostInterest: number;
        accumulatedFactor: number;
        days: number;
    }> {
        const factor = await this.getAccumulatedFactor(startDate, endDate);
        const lostInterest = principal * (factor - 1);

        // Calcular dias úteis (simplificado: count de rows do CDI)
        const cdiData = await conexosService.getCDI(startDate, endDate);
        const rows = Array.isArray(cdiData) ? cdiData : (cdiData?.rows || []);

        return {
            lostInterest,
            accumulatedFactor: factor,
            days: rows.length > 0 ? rows.length - 1 : 0 // -1 pois a primeira taxa é do dia seguinte
        };
    }
}

export const cdiCalculatorService = new CDICalculatorService();
