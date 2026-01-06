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
	taxaConecta: number; // Taxa do Conecta (%)
	taxaCalculada?: number; // Taxa calculada (opcional)
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

export interface ConectaSubmission {
	processId: string;
	clientName: string;
	totalCharges: number;
	encargosFinanceiros: number;
	taxaFinanceira: number;
	submittedAt: string;
}
