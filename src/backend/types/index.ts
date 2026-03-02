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

export interface CalculationResult {
	processId: string;
	clienteId: string;
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
	}>;
	totalInterest: number;
	totalLostInterest?: number;
	totalCharges: number;
	hasExistingInterest?: boolean;
	payments: Payment[];
	summary: any;
}

export interface ConexosSubmission {
	processId: string;
	clientName: string;
	totalCharges: number;
	encargosFinanceiros: number;
	taxaFinanceira: number;
	submittedAt: string;
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
