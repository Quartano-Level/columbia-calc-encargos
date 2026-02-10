import { bcbService } from './bcb.js';
import { boxLog } from '../utils/index.js';

export class CDICalculatorService {
    /**
     * Calcula o fator acumulado do CDI para um intervalo de datas (capitalização composta).
     * Fonte: API pública do Banco Central (série 12 - CDI).
     * @param startDate Data de início (Vencimento - exclusive)
     * @param endDate Data de fim (Pagamento - inclusive)
     * @returns Fator acumulado (ex: 1.0005)
     */
    async getAccumulatedFactor(startDate: string, endDate: string): Promise<number> {
        boxLog('CDICalculator: getAccumulatedFactor', { startDate, endDate });

        if (new Date(startDate) >= new Date(endDate)) {
            return 1;
        }

        const { factor } = await bcbService.getAccumulatedFactor(startDate, endDate);
        return factor;
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
        if (new Date(startDate) >= new Date(endDate)) {
            return { lostInterest: 0, accumulatedFactor: 1, days: 0 };
        }

        const { factor, days } = await bcbService.getAccumulatedFactor(startDate, endDate);
        const lostInterest = principal * (factor - 1);

        return {
            lostInterest,
            accumulatedFactor: factor,
            days,
        };
    }
}

export const cdiCalculatorService = new CDICalculatorService();
