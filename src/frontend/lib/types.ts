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
	// Conexos-specific fields (optional for backwards compatibility)
	dpeNomPessoa?: string;
	priEspRefcliente?: string;
	priCod?: number;
	imcNumNumero?: string;
}

export interface Payment {
	id: string;
	type?: "cambio" | "despesa" | "frete" | "seguro" | "outros";
	description: string;
	value: number;
	paymentDate: string;
	dueDate: string;
	days?: number;
	interestRate?: number;
	calculatedInterest?: number;
}

export interface CalculationInput {
	processId: string;
	emissionDate: string;
	payments: Payment[];
	taxaCDI: number;
	taxaConecta: number;
	taxaCalculada?: number;
}

export interface CalculationResult {
	processId: string | number;
	emissionDate: string;
	totalDisburse: number;
	totalInterest: number;
	totalCharges: number;
	payments: Payment[];
	summary: {
		calculationDate: string;
		taxaCDI: number;
		taxaConecta: number;
		effectiveRate: number;
	};
}

// Best-effort shape for backend calculation response (raw)
export interface BackendCalculationResponse {
	produto?: string;
	quantidadeTN?: number;
	procedencia?: string;
	ncm?: string;
	declaracaoImportacao?: string;
	custosUSD?: Record<string, number>;
	cambio?: {
		prazoDias?: number;
		dataVencimento?: string;
		cdiAM?: number;
		txSpotCompra?: number;
		txPtaxDI?: number;
		txFuturaVenc?: number;
		taxaDolarFiscal?: number;
		valorCIFbrl?: number;
	};
	impostos?: any;
	creditos?: any;
	despesas?: any;
	encargos?: {
		variacaoCambial?: number;
		encargosFinanciamento?: number;
		encargosAlongamento?: number;
		custoDesembaraco?: number;
		despesasDiversas?: number;
		custoComercializacao?: number;
		total?: number;
	};
	custos?: {
		custoTotalImportacao?: number;
		custoEntradaLiquido?: number;
		custoUnitarioTN?: number;
	};
	precos?: any;
	movimentos?: Array<{
		data?: string;
		historico?: string;
		diasCorridos?: number;
		txSpot?: number;
		valorUSD?: number;
		encargos?: number;
		total?: number;
	}>;
	summary?: any;
}
