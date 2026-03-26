import { Process, Payment, CalculationInput, CalculationResult, BackendCalculationResponse, BCBAnnualizedCDI } from "./types";
import { mapBackendToCalculationResult } from "./mappers";


// URL do backend Express local - Remove trailing slash if present to avoid double slashes
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export async function fetchCalculations(limit = 100): Promise<any[]> {
	const response = await fetch(`${API_BASE_URL}/calculations?limit=${limit}`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	return data?.data || [];
}

export async function fetchCalculation(id: string): Promise<any> {
	const response = await fetch(`${API_BASE_URL}/calculations/${id}`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	return data?.data || data;
}



export interface Filial {
	filCod: number;
	filDesNome: string;
	ufEspSigla: string;
}

export async function fetchFiliais(): Promise<Filial[]> {
	const response = await fetch(`${API_BASE_URL}/filiais`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	return data?.data || [];
}

export async function fetchProcesses(filters?: { priCod?: string; refExterna?: string }): Promise<Process[]> {
	const params = new URLSearchParams();
	if (filters?.priCod) params.append('priCod', filters.priCod);
	if (filters?.refExterna) params.append('refExterna', filters.refExterna);
	const queryString = params.toString();
	const url = queryString ? `${API_BASE_URL}/processes?${queryString}` : `${API_BASE_URL}/processes`;

	const response = await fetch(url, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	// Garante que sempre retorna array
	if (Array.isArray(data?.data?.processes)) return data.data.processes;
	if (Array.isArray(data?.data)) return data.data;
	if (Array.isArray(data)) return data;
	return [];
}

export interface ProcessWithContract extends Process {
	contracts?: any[];
	contractData?: {
		taxa: number;
		moeda: string;
		valorMoeda: number;
		imcCod: number;
	} | null;
	paymentData?: {
		status: string;
		date?: string;
		amount?: number;
		nextDueDate?: string;
	} | null;
	payments?: any[];
}

export interface ProcessesWithContractsResponse {
	processes: ProcessWithContract[];
	totalCount: number;
	page: number;
	pageSize: number;
	contracts?: any[];
	totalProcesses?: number;
	totalContracts?: number;
}

export async function fetchProcessesWithContracts(opts?: {
	filCod?: number;
	page?: number;
	pageSize?: number;
	clientName?: string;
	refExterna?: string;
}): Promise<ProcessesWithContractsResponse> {
	const params = new URLSearchParams();
	if (opts?.filCod) params.append('filCod', String(opts.filCod));
	if (opts?.page) params.append('page', String(opts.page));
	if (opts?.pageSize) params.append('pageSize', String(opts.pageSize));
	if (opts?.clientName) params.append('clientName', opts.clientName);
	if (opts?.refExterna) params.append('refExterna', opts.refExterna);
	const qs = params.toString();
	const url = qs
		? `${API_BASE_URL}/processes/with-contracts?${qs}`
		: `${API_BASE_URL}/processes/with-contracts`;

	const response = await fetch(url, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	return data?.data || { processes: [], totalCount: 0, page: 1, pageSize: 20 };
}

/** TODOS os processos (sem filtro de contratos) - para exportação da planilha */
export async function fetchAllProcesses(): Promise<{ processes: any[] }> {
	const url = `${API_BASE_URL}/processes/all`;
	if (!API_BASE_URL) {
		throw new Error("NEXT_PUBLIC_API_URL não configurado. Configure a variável de ambiente apontando para o backend (ex: http://localhost:3001).");
	}
	const response = await fetch(url, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) {
		let errMsg = `API Error: ${response.status}`;
		try {
			const body = await response.json();
			if (body?.error) errMsg = body.error;
			if (body?.details) errMsg += ` - ${body.details}`;
		} catch {
			// ignora se body não for JSON
		}
		throw new Error(errMsg);
	}
	const data = await response.json();
	return data?.data || { processes: [] };
}

/** V2: Processos para exportação baseada em NFs (com297 → com311 → com017) */
export async function fetchProcessesForExportV2(filCod?: number): Promise<{ processes: any[] }> {
	const url = filCod
		? `${API_BASE_URL}/processes/for-export-v2?filCod=${filCod}`
		: `${API_BASE_URL}/processes/for-export-v2`;
	if (!API_BASE_URL) {
		throw new Error("NEXT_PUBLIC_API_URL não configurado.");
	}
	const response = await fetch(url, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) {
		let errMsg = `API Error: ${response.status}`;
		try {
			const body = await response.json();
			if (body?.error) errMsg = body.error;
			if (body?.details) errMsg += ` - ${body.details}`;
		} catch { /* ignore */ }
		throw new Error(errMsg);
	}
	const data = await response.json();
	return data?.data || { processes: [] };
}

/** @deprecated Use fetchProcessesForExportV2 */
export async function fetchProcessesForExport(filCod?: number): Promise<{ processes: any[] }> {
	const url = filCod
		? `${API_BASE_URL}/processes/for-export?filCod=${filCod}`
		: `${API_BASE_URL}/processes/for-export`;
	if (!API_BASE_URL) {
		throw new Error("NEXT_PUBLIC_API_URL não configurado. Configure a variável de ambiente apontando para o backend (ex: http://localhost:3001).");
	}
	const response = await fetch(url, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) {
		let errMsg = `API Error: ${response.status}`;
		try {
			const body = await response.json();
			if (body?.error) errMsg = body.error;
			if (body?.details) errMsg += ` - ${body.details}`;
		} catch {
			// ignora se body não for JSON
		}
		throw new Error(errMsg);
	}
	const data = await response.json();
	return data?.data || { processes: [] };
}


export async function fetchProcess(id: string, filCod?: number): Promise<{ process: Process; payments: Payment[] }> {
	const params = filCod ? `?filCod=${filCod}` : '';
	const response = await fetch(`${API_BASE_URL}/processes/${id}${params}`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	return data.data || data;
}

export async function fetchContracts(): Promise<any[]> {
	const response = await fetch(`${API_BASE_URL}/processes/contracts`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	// backend returns { source: 'conexos', data: contracts }
	return data?.data || [];
}

export async function fetchContractsByProcess(priCod: number, filCod?: number): Promise<any[]> {
	const params = filCod ? `?filCod=${filCod}` : '';
	const response = await fetch(`${API_BASE_URL}/processes/${priCod}/contracts${params}`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	// backend returns { source: 'conexos', data: contracts }
	return data?.data || [];
}

/** Retorna o valor de encargos financeiros do processo (pidMnyValormn onde ctpDesNome = 'ENCARGOS FINANCEIROS') */
export async function fetchEncargosFinanceirosByProcess(priCod: number): Promise<number | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/processes/${priCod}/expenses`, {
			method: "GET",
			headers: { "Accept": "application/json" },
		});
		if (!response.ok) return null;
		const data = await response.json();
		const expenses = Array.isArray(data?.data) ? data.data : (data?.data?.rows || []);
		const encargosRow = expenses.find(
			(d: any) => (d.ctpDesNome || d.impDesNome || '').toUpperCase() === 'ENCARGOS FINANCEIROS'
		);
		return encargosRow != null && encargosRow.pidMnyValormn != null
			? Number(encargosRow.pidMnyValormn)
			: null;
	} catch {
		return null;
	}
}

/** Retorna todas as despesas de um processo */
export async function fetchExpensesByProcess(priCod: number, filCod?: number): Promise<any[]> {
	try {
		const params = filCod ? `?filCod=${filCod}` : '';
		const response = await fetch(`${API_BASE_URL}/processes/${priCod}/expenses${params}`, {
			method: "GET",
			headers: { "Accept": "application/json" },
		});
		if (!response.ok) return [];
		const data = await response.json();
		return Array.isArray(data?.data) ? data.data : (data?.data?.rows || []);
	} catch {
		return [];
	}
}

export interface TaxNFItem {
	impDesNome: string;
	dtrPctAliquota: number | null;
	dtrMnyValormn: number;
	dtrMnyValorDolar: number;
	dtrNumOrdem: number;
}

export interface ConsolidatedTaxItem extends TaxNFItem {
	aliquotas: number[];
}

export interface TaxByNF {
	docCod: number;
	docEspNumero: string;
	docDtaEmissao: string;
	dpeNomPessoa: string;
	impostos: TaxNFItem[];
}

export interface ProcessTaxesResponse {
	byNF: TaxByNF[];
	consolidated: ConsolidatedTaxItem[];
	totalNFs: number;
}

/** Retorna impostos consolidados das NFs do processo (com297 + com017/encargosGerais) */
export async function fetchTaxesByProcess(priCod: number, pesCod: number, filCod?: number): Promise<ProcessTaxesResponse> {
	try {
		const params = new URLSearchParams({ pesCod: String(pesCod) });
		if (filCod) params.set('filCod', String(filCod));
		const response = await fetch(`${API_BASE_URL}/processes/${priCod}/taxes?${params}`, {
			method: "GET",
			headers: { "Accept": "application/json" },
		});
		if (!response.ok) return { byNF: [], consolidated: [], totalNFs: 0 };
		const data = await response.json();
		return data?.data ?? { byNF: [], consolidated: [], totalNFs: 0 };
	} catch {
		return { byNF: [], consolidated: [], totalNFs: 0 };
	}
}

export async function fetchCDI(startDate?: string, endDate?: string): Promise<any[]> {
	const params = new URLSearchParams();
	if (startDate) params.append('startDate', startDate);
	if (endDate) params.append('endDate', endDate);
	const queryString = params.toString();
	const url = queryString ? `${API_BASE_URL}/cdi?${queryString}` : `${API_BASE_URL}/cdi`;
	const response = await fetch(url, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	// Conexos returns an object like { count, pageNumber, rows: [...] }
	if (data?.data?.rows) return data.data.rows;
	if (data?.data) return Array.isArray(data.data) ? data.data : (data.data.rows || []);
	if (data?.rows) return data.rows;
	return [];
}


export async function calculateCharges(id: string, input: CalculationInput): Promise<CalculationResult> {
	const response = await fetch(`${API_BASE_URL}/calculate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		body: JSON.stringify(input),
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const raw = await response.json();
	const normalizedRaw = mapBackendToCalculationResult(raw);
	const toPayment = (m: any): Payment => ({
		id: m.id || `${m.paymentDate || m.data || ''}-${m.description || m.historico || ''}`,
		type: m.type || m.tipo || 'cambio',
		description: m.description || m.historico || '',
		value: Number(m.valorUSD || m.total || m.value || 0) || 0,
		paymentDate: m.paymentDate || m.data || '',
		dueDate: m.dueDate || m.data || '',
		days: Number(m.diasCorridos || m.days || 0) || 0,
		interestRate: Number(m.txSpot || m.tx_spot || 0) || 0,
		calculatedInterest: Number(m.encargos || m.calculatedInterest || 0) || 0,
	});
	const paymentsMapped: Payment[] = (normalizedRaw.movimentos || []).map(toPayment);
	const result: CalculationResult = {
		processId: normalizedRaw.processoId || id,
		emissionDate: normalizedRaw.emissionDate || input.emissionDate,
		totalDisburse: Number(normalizedRaw.summary?.totalDesembolso) || paymentsMapped.reduce((s, p) => s + p.value, 0) || 0,
		totalInterest: Number(normalizedRaw.encargos?.total) || 0,
		totalCharges: Number(normalizedRaw.custos?.custoTotalImportacao || normalizedRaw.encargos?.total) || 0,
		payments: paymentsMapped,
		summary: {
			calculationDate: normalizedRaw.summary?.calculadoEm || new Date().toISOString(),
			taxaCDI: Number(normalizedRaw.cambio?.cdiAM) || input.taxaCDI || 0,
			taxaConexos: Number(normalizedRaw.cambio?.txSpotCompra) || input.taxaConexos || 0,
			effectiveRate: 0,
		},
		despesas: Array.isArray(normalizedRaw.despesas) ? normalizedRaw.despesas : [],
		totalLostInterest: Number(normalizedRaw.totalLostInterest) || 0,
		hasExistingInterest: !!normalizedRaw.hasExistingInterest
	};
	return result;
}


/** Busca série histórica CDI diária do BCB para um período */
export async function fetchBCBCDIHistory(
	startDate: string,
	endDate: string
): Promise<Array<{ date: string; dailyRate: number }>> {
	try {
		const response = await fetch(
			`${API_BASE_URL}/bcb/cdi?startDate=${startDate}&endDate=${endDate}`,
			{ method: "GET", headers: { "Accept": "application/json" } }
		);
		if (!response.ok) return [];
		const data = await response.json();
		return Array.isArray(data?.data) ? data.data : [];
	} catch {
		return [];
	}
}

export async function fetchBCBLatestCDI(): Promise<BCBAnnualizedCDI | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/bcb/cdi/latest`, {
			method: "GET",
			headers: { "Accept": "application/json" },
		});
		if (!response.ok) return null;
		const data = await response.json();
		return data?.data || null;
	} catch {
		return null;
	}
}

/** Fetch latest Ptax venda rate from BCB */
export async function fetchBCBLatestPtaxVenda(): Promise<{ date: string; rate: number } | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/bcb/ptax-venda/latest`, {
			method: "GET",
			headers: { "Accept": "application/json" },
		});
		if (!response.ok) return null;
		const data = await response.json();
		return data?.data || null;
	} catch {
		return null;
	}
}

/** Fetch Ptax venda rate for a specific date from BCB */
export async function fetchBCBPtaxVenda(date: string): Promise<number | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/bcb/ptax-venda?date=${date}`, {
			method: "GET",
			headers: { "Accept": "application/json" },
		});
		if (!response.ok) return null;
		const data = await response.json();
		return data?.data?.rate || null;
	} catch {
		return null;
	}
}

/** Fetch enriched contract data (with Taxa Ptax DI, dataFaturamento, flags) */
export async function fetchEnrichedContractData(priCod: number, imcCod: number, filCod?: number): Promise<any> {
	const params = filCod ? `?filCod=${filCod}` : '';
	const response = await fetch(`${API_BASE_URL}/processes/${priCod}/contracts/${imcCod}/enriched${params}`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	return data?.data || null;
}

export interface AppSettings {
	filial_padrao: string;
	fonte_cdi: 'bcb' | 'conexos';
	cdi_manual: string;
}

export async function fetchSettings(): Promise<AppSettings> {
	const response = await fetch(`${API_BASE_URL}/settings`, {
		headers: { Accept: 'application/json' },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const json = await response.json();
	return json.data as AppSettings;
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
	const response = await fetch(`${API_BASE_URL}/settings`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(settings),
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
}

export interface MonthlySummary {
	month: string;        // "YYYY-MM"
	totalEncargos: number;
	count: number;
	submitted: number;
}

export async function fetchCalculationsSummary(months = 6): Promise<MonthlySummary[]> {
	try {
		const response = await fetch(`${API_BASE_URL}/calculations/summary?months=${months}`, {
			headers: { Accept: 'application/json' },
		});
		if (!response.ok) return [];
		const data = await response.json();
		return Array.isArray(data?.data) ? data.data : [];
	} catch {
		return [];
	}
}

/** Busca o total de Valor a Permutar (mnyTitPermutar) de todos os adiantamentos via com299 */
export async function fetchValorPermutar(): Promise<number> {
  try {
    const response = await fetch(`${API_BASE_URL}/com299/valor-permutar`, {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error || data?.details || `HTTP ${response.status}`;
      throw new Error(`Valor a Permutar: ${msg}`);
    }
    return Number(data?.data?.valorPermutar ?? 0);
  } catch (err: any) {
    if (err?.message?.startsWith('Valor a Permutar:')) throw err;
    throw new Error(`Valor a Permutar: ${err?.message || 'Erro de rede'}`);
  }
}

export interface Com299Row {
  docCod: number;
  priCod: number;
  mnyBruto: number;
  mnyAcrescimo: number;
  mnyDesconto: number;
  mnyTitValor: number;
  mnyTitPago: number;
  mnyTitPermuta: number;
  mnyTitAberto: number;
  mnyTitPermutar: number;
  docDtaEmissao: string | null;
  borDtaFinalizado: string | null;
}

/** Busca lista completa com299 (adiantamentos) para exportação */
export async function fetchCom299List(): Promise<Com299Row[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/com299/list`, {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error || data?.details || `HTTP ${response.status}`;
      throw new Error(`Lista com299: ${msg}`);
    }
    return Array.isArray(data?.data?.rows) ? data.data.rows : [];
  } catch (err: any) {
    if (err?.message?.startsWith('Lista com299:')) throw err;
    throw new Error(`Lista com299: ${err?.message || 'Erro de rede'}`);
  }
}

/** Salva cálculo no backend (POST /calculations) e retorna o resultado com UUID do banco. */
export async function saveCalculationToBackend(input: {
  processId: string;
  emissionDate: string;
  payments: any[];
  taxaCDI?: number;
  taxaConexos?: number;
  taxaPtaxDI?: number;
}): Promise<{ id: string; totalInterest: number; totalCharges: number; [k: string]: any }> {
  const response = await fetch(`${API_BASE_URL}/calculations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `Erro ao salvar cálculo: ${response.status}`);
  }
  return response.json();
}

/** Salva cálculo v2 (payload por item) no backend. */
export async function saveCalculationV2(payload: import('./types').CalculationPayloadV2): Promise<{ id: string; status: string; version: number }> {
  const response = await fetch(`${API_BASE_URL}/calculations/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `Erro ao salvar cálculo: ${response.status}`);
  }
  return response.json();
}

export interface SubmitToConexosPayload {
	processId: string;
	emissionDate: string;
	totalInterest: number;
	taxaDolarFiscal?: number;
}

export async function submitToConexos(id: string, payload: SubmitToConexosPayload): Promise<{ success: boolean; message: string }> {
	const response = await fetch(`${API_BASE_URL}/calculations/${id}/submit`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		body: JSON.stringify(payload),
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	return await response.json();
}
