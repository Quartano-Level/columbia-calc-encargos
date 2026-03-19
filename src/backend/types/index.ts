export interface Process {
	id: string;
	processNumber: string;
	clientName: string;
	incoterm: string;
	mercadoriasValue: number;
	currency: string;
	status: "pending" | "calculated" | "submitted";
	createdAt: string;
	updatedAt: string;
}

export interface Payment {
	id: string;
	type: "cambio" | "despesa" | "frete" | "seguro" | "outros";
	description: string;
	value: number;
	paymentDate: string;
	dueDate: string;
	days?: number;
	interestRate?: number;
	calculatedInterest?: number;
	lostInterest?: number;
	lateDays?: number;
	accumulatedFactor?: number;
}

export interface CalculationInput {
	processId: string;
	emissionDate: string;
	payments: Payment[];
	taxaCDI: number; // Taxa CDI anual (%)
	taxaConexos: number; // Taxa do Conexos (%)
	taxaCalculada?: number; // Taxa calculada (opcional)
	taxaPtaxDI?: number; // Taxa Ptax na data da D.I. — para cálculo de variação cambial
}

export interface InputSnapshot {
	/** CalculationInput original recebido */
	originalInput: CalculationInput;
	/** Fonte do CDI utilizado: bcb, conexos ou manual */
	cdiSource: 'bcb' | 'conexos' | 'manual';
	/** Valor bruto do CDI da fonte Conexos (ftxNumFatDiario) */
	cdiConexosRaw?: number;
	/** Valor CDI efetivamente usado no cálculo (diário) */
	cdiUsado: number;
	/** Base de dias usada (360 ou 252) */
	baseDias: 360 | 252;
	/** Timestamp ISO da consulta/cálculo */
	fetchedAt: string;
	/** Parâmetros de config operacional */
	configUsado: {
		filCod: number;
		impCod: number;
		ctpCod: number;
		usnCod: string;
		calcBase: 360 | 252;
	};
	/** Fonte dos movimentos: 'frontend' (input.payments) ou 'conexos' (parcelas) */
	movimentosSource: 'frontend' | 'conexos';
}

export interface CalculationResult {
	/** UUID do registro salvo no Supabase — retornado após persistência */
	id?: string;
	processId: string;
	processoNumero?: string;
	clienteId: string;
	clienteNome?: string;
	totalDisburse: number;
	custosUSD: {
		fobTotal: number;
		freteTotal: number;
		seguroTotal: number;
		cifTotal: number;
	};
	cambio: {
		cdiAM: number;
		txSpotCompra: number;
		txFuturaVenc: number;
		taxaDolarFiscal: number;
		valorCIFbrl: number;
	};
	impostos: Record<string, number>;
	creditos: Record<string, number>;
	despesas: Array<{
		tipo: string;
		descricao: string;
		valor: number;
	}>;
	encargos: Record<string, number>;
	custos: Record<string, number>;
	precos: Record<string, number>;
	movimentos: Array<{
		data: string;
		historico: string;
		diasCorridos: number;
		txSpot: number;
		valorUSD: number;
		encargos: number;
		total: number;
		/** Campos de breakdown da fórmula (RF-02) */
		taxaAnualUsada?: number;
		taxaDiariaUsada?: number;
		baseDias?: number;
		formula?: string;
	}>;
	totalInterest: number;
	totalLostInterest?: number;
	totalCharges: number;
	hasExistingInterest?: boolean;
	payments: Payment[];
	summary: any;
	inputSnapshot?: InputSnapshot;
}

export interface ConexosSubmission {
	processId: string;
	clientName: string;
	totalCharges: number;
	encargosFinanceiros: number;
	taxaFinanceira: number;
	submittedAt: string;
}

// ── Memória de Cálculo v2 — payload por item ─────────────────────

/** Item individual de cálculo (contrato ou despesa) */
export interface CalculationItem {
	id: string;
	type: 'contract' | 'expense';
	label: string;
	valorBase: number;
	moeda: string;
	valorMoedaOriginal?: number;
	prazoEmDias: number;
	dataBase: string;
	dataVencimento: string;
	cdiAoAno: number;
	spread: number;
	taxaEfetiva: number;
	iofValue?: number;
	baseDias: 360 | 252;
	encargosCalculados: number;
	formula: string;
	taxaFechamento?: number | null;
	taxaPtaxDI?: number | null;
	taxaSpotDoDia?: number | null;
	taxaSpotNegociada?: number | null;
	taxaFutura?: number | null;
	contasProjeto?: string[];
	detalhesDespesa?: Array<{
		contaProjeto: string;
		encargo: string;
		dataConversao: string;
		valorBRL: number;
		encargosProporcionais?: number;
	}>;
}

/** Payload completo enviado pelo frontend (v2) */
export interface CalculationSavePayload {
	processId: string;
	processoNumero: string;
	clienteId: string;
	clienteNome: string;
	refExterna: string;
	emissionDate: string;
	items: CalculationItem[];
	totalEncargos: number;
	totalValorBase: number;
	calculadoEm: string;
	payloadVersion: 2;
}

// BCB (Banco Central do Brasil) API types

/** Raw entry from BCB API response */
export interface BCBRateEntry {
	data: string;  // DD/MM/YYYY
	valor: string; // daily rate as % (e.g., "0.055131")
}

/** Normalized BCB rate with ISO date and numeric values */
export interface NormalizedRate {
	date: string;        // YYYY-MM-DD
	dailyRate: number;   // percentage (e.g., 0.055131)
	dailyFactor: number; // 1 + dailyRate/100 (e.g., 1.00055131)
}

/** CDI rate annualized from daily BCB data */
export interface AnnualizedCDI {
	date: string;
	dailyRate: number;
	annualRate: number;  // ((1+rate/100)^252 - 1) * 100
	monthlyRate: number; // (annualRate / 12) + 0.4
}
