import axios, { AxiosInstance } from 'axios';
import { boxLog } from '../utils/index.js';
import type { BCBRateEntry, NormalizedRate, AnnualizedCDI } from '../types/index.js';

const CDI_SERIES = 12;
const PTAX_VENDA_SERIES = 10813;
const BUSINESS_DAYS_YEAR = 252;

class BCBService {
  private client: AxiosInstance;
  private cache: Map<string, { data: any; fetchedAt: number }>;
  private readonly CACHE_TTL_HISTORICAL = 6 * 60 * 60 * 1000; // 6h
  private readonly CACHE_TTL_LATEST = 1 * 60 * 60 * 1000; // 1h

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.bcb.gov.br/dados/serie',
      timeout: 15000,
    });
    this.cache = new Map();
  }

  /** Converte YYYY-MM-DD → DD/MM/YYYY (formato BCB) */
  private formatDateBCB(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  /** Converte DD/MM/YYYY (formato BCB) → YYYY-MM-DD */
  private parseDateBCB(bcbDate: string): string {
    const [day, month, year] = bcbDate.split('/');
    return `${year}-${month}-${day}`;
  }

  /** Verifica se cache é válido para a chave dada */
  private getCached<T>(key: string, ttl: number): T | null {
    const entry = this.cache.get(key);
    if (entry && (Date.now() - entry.fetchedAt) < ttl) {
      return entry.data as T;
    }
    return null;
  }

  /** Armazena dados no cache */
  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, fetchedAt: Date.now() });
  }

  /**
   * Busca dados de uma série do BCB para um intervalo de datas.
   * Retorna array normalizado com datas ISO e valores numéricos.
   */
  private async getSeriesData(seriesId: number, startDate: string, endDate: string): Promise<NormalizedRate[]> {
    const cacheKey = `${seriesId}:${startDate}:${endDate}`;
    const cached = this.getCached<NormalizedRate[]>(cacheKey, this.CACHE_TTL_HISTORICAL);
    if (cached) {
      if (process.env.DEBUG_VERBOSE === '1') console.log(`[BCB] Cache hit: ${cacheKey}`);
      return cached;
    }

    const bcbStart = this.formatDateBCB(startDate);
    const bcbEnd = this.formatDateBCB(endDate);
    const url = `/bcdata.sgs.${seriesId}/dados?formato=json&dataInicial=${bcbStart}&dataFinal=${bcbEnd}`;

    boxLog('BCB: getSeriesData', { seriesId, startDate, endDate, url });

    const resp = await this.client.get<BCBRateEntry[]>(url);
    const raw = Array.isArray(resp.data) ? resp.data : [];

    const normalized: NormalizedRate[] = raw.map((entry) => {
      const dailyRate = parseFloat(entry.valor);
      return {
        date: this.parseDateBCB(entry.data),
        dailyRate,
        dailyFactor: 1 + dailyRate / 100,
      };
    });

    // Ordenar por data ascendente
    normalized.sort((a, b) => a.date.localeCompare(b.date));

    this.setCache(cacheKey, normalized);
    if (process.env.DEBUG_VERBOSE === '1') console.log(`[BCB] Fetched ${normalized.length} records for series ${seriesId} (${startDate} → ${endDate})`);
    return normalized;
  }

  /**
   * Busca taxas CDI diárias para um intervalo.
   * @param startDate YYYY-MM-DD
   * @param endDate YYYY-MM-DD
   */
  async getCDIDaily(startDate: string, endDate: string): Promise<NormalizedRate[]> {
    return this.getSeriesData(CDI_SERIES, startDate, endDate);
  }

  /**
   * Busca a taxa CDI mais recente e retorna anualizada.
   * Usa o endpoint /ultimos/1 do BCB.
   */
  async getLatestCDI(): Promise<AnnualizedCDI> {
    const cacheKey = `latest:${CDI_SERIES}`;
    const cached = this.getCached<AnnualizedCDI>(cacheKey, this.CACHE_TTL_LATEST);
    if (cached) {
      if (process.env.DEBUG_VERBOSE === '1') console.log(`[BCB] Cache hit: ${cacheKey}`);
      return cached;
    }

    const url = `/bcdata.sgs.${CDI_SERIES}/dados/ultimos/1?formato=json`;
    boxLog('BCB: getLatestCDI', { url });

    const resp = await this.client.get<BCBRateEntry[]>(url);
    const raw = Array.isArray(resp.data) ? resp.data : [];

    if (raw.length === 0) {
      throw new Error('BCB retornou array vazio para último CDI');
    }

    const entry = raw[0];
    const dailyRate = parseFloat(entry.valor);
    const annualRate = (Math.pow(1 + dailyRate / 100, BUSINESS_DAYS_YEAR) - 1) * 100;
    const monthlyRate = (annualRate / 12) + 0.4;

    const result: AnnualizedCDI = {
      date: this.parseDateBCB(entry.data),
      dailyRate,
      annualRate: parseFloat(annualRate.toFixed(4)),
      monthlyRate: parseFloat(monthlyRate.toFixed(4)),
    };

    this.setCache(cacheKey, result);
    if (process.env.DEBUG_VERBOSE === '1') console.log(`[BCB] Latest CDI: ${result.annualRate}% a.a. (${result.date})`);
    return result;
  }

  /**
   * Calcula o fator acumulado CDI (capitalização composta) para um intervalo.
   * @param startDate Data início (exclusive — computa a partir do dia seguinte)
   * @param endDate Data fim (inclusive)
   * @returns Fator acumulado (ex: 1.0053)
   */
  async getAccumulatedFactor(startDate: string, endDate: string): Promise<{ factor: number; days: number }> {
    if (new Date(startDate) >= new Date(endDate)) {
      return { factor: 1, days: 0 };
    }

    // Dia seguinte ao startDate (o CDI do dia de vencimento não incide)
    const start = new Date(startDate);
    start.setUTCDate(start.getUTCDate() + 1);
    const startIso = start.toISOString().split('T')[0];

    const rates = await this.getCDIDaily(startIso, endDate);

    if (rates.length === 0) {
      console.warn(`[BCB] Nenhuma taxa CDI encontrada entre ${startIso} e ${endDate}`);
      return { factor: 1, days: 0 };
    }

    let factor = 1;
    for (const rate of rates) {
      factor *= rate.dailyFactor;
    }

    return { factor, days: rates.length };
  }

  /**
   * Busca taxa Ptax venda (USD/BRL) para data específica.
   * Se a data cair em fim de semana/feriado, retorna o último valor disponível.
   * @param date YYYY-MM-DD
   * @returns Taxa Ptax venda do dia (ou mais recente disponível)
   */
  async getPtaxVenda(date: string): Promise<number> {
    const cacheKey = `ptax-venda:${date}`;
    const cached = this.getCached<number>(cacheKey, this.CACHE_TTL_HISTORICAL);
    if (cached) {
      if (process.env.DEBUG_VERBOSE === '1') console.log(`[BCB] Cache hit: ${cacheKey}`);
      return cached;
    }

    // Buscar até 7 dias antes para garantir que pegamos a última Ptax disponível
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 7);
    const startIso = startDate.toISOString().split('T')[0];

    const rates = await this.getSeriesData(PTAX_VENDA_SERIES, startIso, date);

    if (rates.length === 0) {
      throw new Error(`Nenhuma taxa Ptax venda encontrada para ${date}`);
    }

    // Retornar a taxa mais recente (última do array ordenado)
    const latestRate = rates[rates.length - 1].dailyRate;
    this.setCache(cacheKey, latestRate);

    if (process.env.DEBUG_VERBOSE === '1') {
      console.log(`[BCB] Ptax venda para ${date}: ${latestRate} (data: ${rates[rates.length - 1].date})`);
    }

    return latestRate;
  }

  /**
   * Busca a taxa Ptax venda mais recente.
   */
  async getLatestPtaxVenda(): Promise<{ date: string; rate: number }> {
    const cacheKey = `latest:${PTAX_VENDA_SERIES}`;
    const cached = this.getCached<{ date: string; rate: number }>(cacheKey, this.CACHE_TTL_LATEST);
    if (cached) {
      if (process.env.DEBUG_VERBOSE === '1') console.log(`[BCB] Cache hit: ${cacheKey}`);
      return cached;
    }

    const url = `/bcdata.sgs.${PTAX_VENDA_SERIES}/dados/ultimos/1?formato=json`;
    boxLog('BCB: getLatestPtaxVenda', { url });

    const resp = await this.client.get<BCBRateEntry[]>(url);
    const raw = Array.isArray(resp.data) ? resp.data : [];

    if (raw.length === 0) {
      throw new Error('BCB retornou array vazio para última Ptax venda');
    }

    const entry = raw[0];
    const rate = parseFloat(entry.valor);

    const result = {
      date: this.parseDateBCB(entry.data),
      rate,
    };

    this.setCache(cacheKey, result);
    if (process.env.DEBUG_VERBOSE === '1') console.log(`[BCB] Latest Ptax venda: ${rate} (${result.date})`);
    return result;
  }
}

export const bcbService = new BCBService();
