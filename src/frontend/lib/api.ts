import { Process, Payment, CalculationInput, CalculationResult, BackendCalculationResponse } from "./types";
import { mapBackendToCalculationResult } from "./mappers";


// URL do backend Express local
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://fincalc-api.vercel.app";

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
	contracts: any[];
	totalProcesses: number;
	totalContracts: number;
}

export async function fetchProcessesWithContracts(): Promise<ProcessesWithContractsResponse> {
	const response = await fetch(`${API_BASE_URL}/processes/with-contracts`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	return data?.data || { processes: [], contracts: [], totalProcesses: 0, totalContracts: 0 };
}


export async function fetchProcess(id: string): Promise<{ process: Process; payments: Payment[] }> {
	const response = await fetch(`${API_BASE_URL}/processes/${id}`, {
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

export async function fetchContractsByProcess(priCod: number): Promise<any[]> {
	const response = await fetch(`${API_BASE_URL}/processes/${priCod}/contracts`, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	// backend returns { source: 'conexos', data: contracts }
	return data?.data || [];
}

export async function fetchCDI(date?: string): Promise<any[]> {
	const url = date ? `${API_BASE_URL}/cdi?date=${encodeURIComponent(date)}` : `${API_BASE_URL}/cdi`;
	const response = await fetch(url, {
		method: "GET",
		headers: { "Accept": "application/json" },
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	const data = await response.json();
	// Conexos returns an object like { count, pageNumber, rows: [...] }
	if (data?.data?.rows) return data.data.rows;
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
			taxaConecta: Number(normalizedRaw.cambio?.txSpotCompra) || input.taxaConecta || 0,
			effectiveRate: 0,
		}
	};
	return result;
}


export async function submitToConecta(id: string, result: CalculationResult & { clientName: string }): Promise<{ success: boolean; message: string }> {
	const response = await fetch(`${API_BASE_URL}/calculations/${id}/submit`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		body: JSON.stringify(result),
	});
	if (!response.ok) throw new Error(`API Error: ${response.status}`);
	return await response.json();
}
