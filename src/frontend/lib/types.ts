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
	hasFinalizedInvoice?: boolean;
	billingTermDays?: number | null;
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
	dataConversao?: string;
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
	spread: number; // Adicional sobre CDI (ex: 0.6 para CDI+0.6%)
	encargosCalculados: number;
	variacaoCambial?: number;
}

// ── Memória de Cálculo v2 — payload por item ─────────────────────

/** Item individual de cálculo (contrato ou despesa) */
export interface CalculationItem {
	id: string;
	type: 'contract' | 'expense' | 'tax' | 'tax_comercializacao' | 'tax_di';
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
		valorFull?: number;
		valorNacionalizacao?: number;
		isDelta?: boolean;
	}>;
}

/** Payload v2 — por item, salvo no Supabase */
export interface CalculationPayloadV2 {
	payloadVersion: 2;
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
}

// ── Memória de Cálculo (Calculation Detail) ──────────────────────

/** Row do Supabase — tabela calculations */
export interface CalculationRecord {
	id: string;
	processo_id: string;
	processo_numero?: string;
	cliente_id: string;
	cliente_nome?: string;
	payload: CalculationPayload | CalculationPayloadV2;
	total_desembolso: number;
	total_encargos: number;
	status: 'calculated' | 'submitted';
	version: number;
	previous_calculation_id?: string | null;
	calculated_at: string;
	submitted_at?: string | null;
	payload_hash?: string | null;
}

/** Conteúdo do campo payload JSONB */
export interface CalculationPayload {
	processId: string;
	processoNumero?: string;
	clienteId: string;
	clienteNome?: string;
	totalDisburse: number;
	totalInterest: number;
	totalCharges: number;
	totalLostInterest?: number;
	hasExistingInterest?: boolean;
	custosUSD?: {
		fobTotal: number;
		freteTotal: number;
		seguroTotal: number;
		cifTotal: number;
	};
	cambio?: {
		cdiAM: number;
		txSpotCompra: number;
		txFuturaVenc: number;
		taxaDolarFiscal: number;
		valorCIFbrl: number;
	};
	movimentos: Movimento[];
	payments?: any[];
	despesas?: Array<{ tipo: string; descricao: string; valor: number }>;
	encargos?: Record<string, number>;
	custos?: Record<string, number>;
	summary?: {
		numeroMovimentos: number;
		totalDesembolso: number;
		calculadoEm: string;
		calculationDate?: string;
		taxaCDI?: number;
		taxaConexos?: number;
		effectiveRate?: number;
	};
	inputSnapshot?: {
		originalInput: any;
		cdiSource: 'bcb' | 'conexos' | 'manual';
		cdiConexosRaw?: number;
		cdiUsado: number;
		baseDias: 360 | 252;
		fetchedAt: string;
		configUsado: {
			filCod: number;
			impCod: number;
			ctpCod: number;
			usnCod: string;
			calcBase: 360 | 252;
		};
		movimentosSource: 'frontend' | 'conexos';
	};
}

/** Movimento/componente individual do cálculo */
export interface Movimento {
	data: string;
	historico: string;
	diasCorridos: number;
	txSpot: number;
	valorUSD: number;
	encargos: number;
	total: number;
	taxaAnualUsada?: number;
	taxaDiariaUsada?: number;
	baseDias?: number;
	formula?: string;
}
