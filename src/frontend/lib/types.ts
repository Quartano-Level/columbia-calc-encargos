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
	expenses?: any[];
	hasExistingInterest?: boolean;
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
	lateDays?: number;
	lostInterest?: number;
	accumulatedFactor?: number;
}

export interface CalculationInput {
	processId: string;
	emissionDate: string;
	payments: Payment[];
	taxaCDI: number;
	taxaConexos: number;
	taxaCalculada?: number;
	taxaPtaxDI?: number; // Para cálculo de variação cambial no backend
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
		taxaConexos: number;
		effectiveRate: number;
	};
	despesas?: Array<{
		tipo: string;
		descricao: string;
		valor: number;
	}>;
	totalLostInterest?: number;
	hasExistingInterest?: boolean;
	movimentos?: any[];
}

/** CDI rate annualized from BCB API */
export interface BCBAnnualizedCDI {
	date: string;
	dailyRate: number;
	annualRate: number;
	monthlyRate: number;
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

/** Enriched contract data with additional fields from Conexos and flags */
export interface EnrichedContractData {
	imcCod: number;
	imcDtaFechamento: string | number;
	imcFltTxFec: number | null;
	vlrMneg: number;
	vlrTotalNac: number;
	moeEspNome: string;
	priCod: number;
	taxaPtaxDI: number | null;
	dataFaturamento: string | null;
	isAVista: boolean;
	isAPrazo: boolean;
}

/** Calculator form state for the new 3-deck structure */
export interface CalculatorFormState {
	// Deck 1: Process Info
	refExterna: string;
	nomeCliente: string;
	incoterm: string;
	moedaNegociada: string;
	valorMoedaNegociada: number;
	valorMoedaNacional: number;

	// Deck 2: Contract Info
	dataFechamento: string;
	dataFaturamento: string;
	prazoEmDias: number; // INPUT
	vencimentoCliente: string; // calculated

	// Deck 3: Rates
	taxaFechamento: number | null;
	taxaPtaxDI: number | null;
	taxaSpotDoDia: number | null; // BCB
	taxaSpotNegociada: number | null; // INPUT
	taxaFutura: number | null; // INPUT

	// Calculation
	cdiAoAno: number | null;
	cdiMensal?: number | null;
	encargosCalculados: number;
	variacaoCambial?: number;
}
