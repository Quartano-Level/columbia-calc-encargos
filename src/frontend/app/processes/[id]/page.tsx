"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Process, EnrichedContractData, CalculatorFormState, CalculationItem, CalculationPayloadV2 } from "@/lib/types";
import {
	fetchProcess,
	fetchContractsByProcess,
	fetchEnrichedContractData,
	fetchBCBLatestCDI,
	fetchBCBPtaxVenda,
	submitToConexos,
	saveCalculationV2,
	fetchExpensesByProcess,
	fetchTaxesByProcess,
	fetchDataDesembolsoImposto,
	type ProcessTaxesResponse,
	type ConsolidatedTaxItem,
} from "@/lib/api";
import { calcularEncargos } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtectedRoute } from "@/components/protected-route";
import { ArrowLeft, CheckCircle2, FileText, DollarSign, Receipt, Info } from "lucide-react";
import { NumericFormat } from "react-number-format";
import { useToast } from "@/hooks/use-toast";

type TaxaPeriod = 'anual' | 'mensal' | 'diario';

interface CalculatorTab {
	id: string;
	type: 'contract' | 'expense' | 'tax' | 'tax_comercializacao' | 'tax_di';
	label: string;
	sourceData: any;
	formState: CalculatorFormState;
	calculated: boolean;
	enrichedContract?: EnrichedContractData | null;
	taxaPeriod: TaxaPeriod;
	taxaInputValue: number | null;
	iof: boolean;
}

const defaultFormState: CalculatorFormState = {
	refExterna: '',
	nomeCliente: '',
	incoterm: '',
	moedaNegociada: '',
	valorMoedaNegociada: 0,
	valorMoedaNacional: 0,
	dataFechamento: '',
	dataConversao: '',
	dataFaturamento: '',
	prazoEmDias: 0,
	vencimentoCliente: '',
	taxaFechamento: null,
	taxaPtaxDI: null,
	taxaSpotDoDia: null,
	taxaSpotNegociada: null,
	taxaFutura: null,
	cdiAoAno: null,
	spread: 0,
	encargosCalculados: 0,
};

const formatBRL = (val: number) =>
	new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

/** Converte taxa de um período para taxa anual (divisão simples / linear) */
function taxaParaAnual(value: number, period: TaxaPeriod): number {
	if (!value) return 0;
	if (period === 'anual') return value;
	if (period === 'mensal') return value * 12;
	// diario: base 360 dias corridos
	return value * 360;
}

/** Converte taxa anual para o período desejado (divisão simples / linear) */
function taxaDeAnual(annualRate: number, period: TaxaPeriod): number {
	if (!annualRate) return 0;
	if (period === 'anual') return annualRate;
	if (period === 'mensal') return annualRate / 12;
	// diario: base 360 dias corridos
	return annualRate / 360;
}

const PERIOD_LABELS: Record<TaxaPeriod, string> = {
	anual: '% ao ano',
	mensal: '% ao mês',
	diario: '% ao dia',
};

const PERIOD_SHORT: Record<TaxaPeriod, string> = {
	anual: 'a.a.',
	mensal: 'a.m.',
	diario: 'a.d.',
};

/** Impostos base que compõem a aba Comercialização (delta = full - NACIONALIZAÇÃO) */
const COMERCIALIZACAO_BASE_TAXES = ['PIS', 'COFINS', 'IPI', 'ICMS'];

/** Impostos que compõem a aba IMPOSTOS (DI) — valores diretos */
const DI_TAX_NAMES = [
	'SISCOMEX',
	'ANTIDUMPING',
	'COFINS - NACIONALIZACAO',
	'PIS - NACIONALIZACAO',
	'IPI -  NACIONALIZAÇÃO',
	'II - IMPOSTO DE IMPORTAÇÃO',
];

interface ComercializacaoDelta {
	taxName: string;
	valorFull: number;
	valorNacionalizacao: number;
	delta: number;
	aliquotaFull: number | null;
	aliquotaNacionalizacao: number | null;
}

/** Calcula deltas de Comercialização: full – NACIONALIZAÇÃO para cada imposto base */
function calcComercializacaoDeltas(consolidated: ConsolidatedTaxItem[]): ComercializacaoDelta[] {
	return COMERCIALIZACAO_BASE_TAXES.map(baseName => {
		const fullItem = consolidated.find(t =>
			t.impDesNome.toUpperCase() === baseName.toUpperCase()
		);
		const nacItem = consolidated.find(t =>
			t.impDesNome.toUpperCase() !== baseName.toUpperCase() &&
			t.impDesNome.toUpperCase().includes(baseName.toUpperCase()) &&
			t.impDesNome.toUpperCase().includes('NACIONALIZA')
		);

		const valorFull = fullItem?.dtrMnyValormn ?? 0;
		const valorNac = nacItem?.dtrMnyValormn ?? 0;
		const delta = valorFull - valorNac;

		if (valorFull === 0 && valorNac === 0) return null;

		return {
			taxName: baseName,
			valorFull,
			valorNacionalizacao: valorNac,
			delta,
			aliquotaFull: fullItem?.dtrPctAliquota ?? null,
			aliquotaNacionalizacao: nacItem?.dtrPctAliquota ?? null,
		};
	}).filter(Boolean) as ComercializacaoDelta[];
}

/** Filtra impostos DI da lista consolidada */
function filterDITaxes(consolidated: ConsolidatedTaxItem[]): ConsolidatedTaxItem[] {
	return consolidated.filter(t =>
		DI_TAX_NAMES.some(di => t.impDesNome.toUpperCase() === di.toUpperCase())
	);
}

function toIsoDate(value: any): string {
	if (!value) return '';
	try {
		const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
		if (Number.isNaN(d.getTime())) return '';
		return d.toISOString().split('T')[0];
	} catch {
		return '';
	}
}

function getTabBaseDate(tab: CalculatorTab): string {
	if (tab.type === 'contract') return tab.formState.dataFechamento || '';
	if (tab.type === 'tax_di' || tab.type === 'tax_comercializacao') return tab.formState.dataDesembolsoImposto || '';
	return tab.formState.dataConversao || '';
}

function formatConexosBillingTerm(days: number | null | undefined): string {
	if (days == null) return 'null (à vista)';
	if (Number(days) === 0) return '0 (à vista)';
	if (Number.isFinite(Number(days)) && Number(days) > 0) return `${Number(days)} dia(s)`;
	return 'não informado';
}

/** Soma CDI + spread no mesmo período e converte resultado para anual. IOF adiciona 0,38% a.a. */
function taxaEfetivaAnual(cdiAnual: number, spread: number, period: TaxaPeriod, iof: boolean = false): number {
	const cdiNoPeriodo = taxaDeAnual(cdiAnual, period);
	const base = taxaParaAnual(cdiNoPeriodo + spread, period);
	return iof ? base + 0.38 : base;
}

export default function ProcessCalculatorPage() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const processId = params.id as string;
	const contractIdParam = searchParams.get('contractId');
	const filCod = searchParams.get('filCod') ? Number(searchParams.get('filCod')) : undefined;
	const { toast } = useToast();

	const [process, setProcess] = useState<Process | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [loadingBCBCDI, setLoadingBCBCDI] = useState(false);
	const [showSpread, setShowSpread] = useState(false);

	const [tabs, setTabs] = useState<CalculatorTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string>('');
	const [selectedComercializacao, setSelectedComercializacao] = useState<Set<string>>(new Set());
	const [selectedDI, setSelectedDI] = useState<Set<string>>(new Set());

	const activeTab = tabs.find(t => t.id === activeTabId);

	const showError = useCallback((message: string) => {
		toast({ title: 'Erro', description: message, variant: 'destructive' });
	}, [toast]);

	const showSuccess = useCallback((message: string) => {
		toast({ title: 'Sucesso', description: message });
	}, [toast]);

	const updateTabFormState = useCallback((tabId: string, updater: (prev: CalculatorFormState) => CalculatorFormState) => {
		setTabs(prev => prev.map(t =>
			t.id === tabId ? { ...t, formState: updater(t.formState) } : t
		));
	}, []);

	const updateTab = useCallback((tabId: string, updates: Partial<Omit<CalculatorTab, 'id'>>) => {
		setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
	}, []);

	// Calcula Data Vencimento com base na data de fechamento/conversão + prazo
	useEffect(() => {
		if (!activeTab) return;
		const fs = activeTab.formState;
		const baseDate = getTabBaseDate(activeTab);
		if (baseDate && fs.prazoEmDias > 0) {
			const d = new Date(baseDate);
			d.setDate(d.getDate() + fs.prazoEmDias);
			const nextDue = d.toISOString().split('T')[0];
			if (nextDue !== fs.vencimentoCliente) {
				updateTabFormState(activeTab.id, prev => ({
					...prev,
					vencimentoCliente: nextDue
				}));
			}
		} else if (fs.vencimentoCliente) {
			updateTabFormState(activeTab.id, prev => ({ ...prev, vencimentoCliente: '' }));
		}
	}, [activeTab?.id, activeTab?.type, activeTab?.formState.dataFechamento, activeTab?.formState.dataConversao, activeTab?.formState.dataDesembolsoImposto, activeTab?.formState.prazoEmDias]);

	useEffect(() => {
		loadProcessData();
	}, [processId]);

	async function loadProcessData() {
		try {
			setLoading(true);

			const data = await fetchProcess(processId, filCod);
			const processData = data.process;
			setProcess(processData);
			const rawBillingTermDays = processData?.billingTermDays;
			const defaultPrazoEmDias = rawBillingTermDays == null
				? 0
				: (Number.isFinite(Number(rawBillingTermDays)) ? Number(rawBillingTermDays) : 0);

			const priCod = processData?.priCod || parseInt(processId, 10);
			if (isNaN(priCod)) return;

			const raw = (processData as any)?.raw || processData;
			const refExterna = processData?.priEspRefcliente || raw?.priEspRefcliente || processData?.processNumber || '';
			const nomeCliente = processData?.dpeNomPessoa || raw?.dpeNomPessoa || processData?.clientName || '';
			const incoterm = processData?.incoterm || raw?.incoterm || raw?.incEspSigla || '';
			const pesCod = raw?.pesCod || (processData as any)?.pesCod;

			const [contractsData, expensesData, taxesDataRaw, desembolsoResult] = await Promise.all([
				fetchContractsByProcess(priCod, filCod),
				fetchExpensesByProcess(priCod, filCod),
				pesCod ? fetchTaxesByProcess(priCod, Number(pesCod), filCod) : Promise.resolve<ProcessTaxesResponse>({ byNF: [], consolidated: [], totalNFs: 0 }),
				fetchDataDesembolsoImposto(priCod, filCod),
			]);
			const dataDesembolsoImposto = desembolsoResult.dataDesembolso;
			const desembolsoWarnings = desembolsoResult.warnings || [];

			const contractTabs: CalculatorTab[] = await Promise.all(
				(contractsData || []).map(async (contract: any) => {
					const tabId = `contract-${contract.imcCod}`;
					let enriched: EnrichedContractData | null = null;
					try {
						enriched = await fetchEnrichedContractData(priCod, contract.imcCod, filCod);
					} catch (err) {
						console.warn(`Failed to enrich contract ${contract.imcCod}:`, err);
					}

					const formState = enriched
						? await buildContractFormState(enriched, { refExterna, nomeCliente, incoterm }, defaultPrazoEmDias)
						: { ...defaultFormState, refExterna, nomeCliente, incoterm, prazoEmDias: defaultPrazoEmDias };

					return {
						id: tabId,
						type: 'contract' as const,
						label: `Contrato ${contract.imcCod}`,
						sourceData: contract,
						formState,
						calculated: false,
						enrichedContract: enriched,
						taxaPeriod: 'anual' as TaxaPeriod,
						taxaInputValue: null,
						iof: false,
					};
				})
			);

			// Agrupa despesas por encargo (impDesNome) para cálculo consolidado por tipo de encargo
			const groupedExpenses = new Map<string, any[]>();
			(expensesData || []).forEach((exp: any) => {
				const groupKey = (exp.impDesNome || exp.ctpDesNome || 'Outras Despesas').trim();
				const current = groupedExpenses.get(groupKey) || [];
				current.push(exp);
				groupedExpenses.set(groupKey, current);
			});

			const expenseTabs: CalculatorTab[] = Array.from(groupedExpenses.entries()).map(([groupName, items], i) => {
				const tabId = `expense-group-${i}`;
				const moeda = items.find((e: any) => e.moeEspNome)?.moeEspNome || 'BRL';
				const valorMneg = items.reduce((sum: number, e: any) => sum + (Number(e.pidMnyValorMneg || e.pidMnyValor || 0) || 0), 0);
				const valorMn = items.reduce((sum: number, e: any) => sum + (Number(e.pidMnyValormn || 0) || 0), 0);
				const baseValue = valorMn > 0 ? valorMn : valorMneg;
				const dataConversao = toIsoDate(items.find((e: any) => e.pidDtaTaxas)?.pidDtaTaxas);

				return {
					id: tabId,
					type: 'expense' as const,
					label: groupName,
					sourceData: {
						encargo: groupName,
						items,
						projectAccounts: Array.from(new Set(items.map((e: any) => e.ctpDesNome).filter(Boolean))),
					},
					formState: {
						...defaultFormState,
						refExterna,
						nomeCliente,
						incoterm,
						moedaNegociada: moeda,
						valorMoedaNegociada: valorMneg,
						valorMoedaNacional: baseValue,
						dataConversao,
						prazoEmDias: defaultPrazoEmDias,
					},
					calculated: false,
					taxaPeriod: 'anual' as TaxaPeriod,
					taxaInputValue: null,
					iof: false,
				};
			});

			// Abas de impostos: Comercialização (delta) e IMPOSTOS (DI) (valor direto)
			const comercializacaoDeltas = calcComercializacaoDeltas(taxesDataRaw.consolidated);
			const diTaxes = filterDITaxes(taxesDataRaw.consolidated);

			const taxTabs: CalculatorTab[] = [];

			if (comercializacaoDeltas.length > 0) {
				taxTabs.push({
					id: 'tax-comercializacao',
					type: 'tax_comercializacao' as const,
					label: 'Comercialização',
					sourceData: { ...taxesDataRaw, deltas: comercializacaoDeltas },
					formState: {
						...defaultFormState,
						refExterna,
						nomeCliente,
						incoterm,
						prazoEmDias: defaultPrazoEmDias,
						valorMoedaNacional: 0,
						dataDesembolsoImposto: dataDesembolsoImposto || '',
					},
					calculated: false,
					taxaPeriod: 'anual' as TaxaPeriod,
					taxaInputValue: null,
					iof: false,
				});
			}

			if (diTaxes.length > 0) {
				taxTabs.push({
					id: 'tax-di',
					type: 'tax_di' as const,
					label: 'IMPOSTOS (DI)',
					sourceData: { ...taxesDataRaw, diTaxes },
					formState: {
						...defaultFormState,
						refExterna,
						nomeCliente,
						incoterm,
						prazoEmDias: defaultPrazoEmDias,
						valorMoedaNacional: 0,
						dataDesembolsoImposto: dataDesembolsoImposto || '',
					},
					calculated: false,
					taxaPeriod: 'anual' as TaxaPeriod,
					taxaInputValue: null,
					iof: false,
				});
			}

			setSelectedComercializacao(new Set());
			setSelectedDI(new Set());

			const diTab = taxTabs.find(t => t.id === 'tax-di');
			const comercializacaoTab = taxTabs.find(t => t.id === 'tax-comercializacao');

			const allTabs = diTab
				? [
					diTab,
					...expenseTabs,
					...contractTabs,
					...(comercializacaoTab ? [comercializacaoTab] : []),
				]
				: [
					...contractTabs,
					...expenseTabs,
					...(comercializacaoTab ? [comercializacaoTab] : []),
				];
			setTabs(allTabs);

			if (desembolsoWarnings.length > 0 && taxTabs.length > 0) {
				desembolsoWarnings.forEach(w => showError(w));
			}

			if (contractIdParam && allTabs.length > 0) {
				const match = allTabs.find(t => t.id === `contract-${contractIdParam}`);
				setActiveTabId(match?.id || allTabs[0].id);
			} else if (allTabs.length > 0) {
				setActiveTabId(allTabs[0].id);
			}
		} catch (err: any) {
			console.error('Error loading process:', err);
			showError(err.message || 'Erro ao carregar processo');
		} finally {
			setLoading(false);
		}
	}

	async function buildContractFormState(
		contract: EnrichedContractData,
		processInfo: { refExterna: string; nomeCliente: string; incoterm: string },
		defaultPrazoEmDias = 0
	): Promise<CalculatorFormState> {
		const moedaNegociada = contract.moeEspNome || 'USD';
		const valorMoedaNegociada = Number(contract.vlrMneg || 0);
		const valorMoedaNacional = Number(contract.vlrTotalNac || 0);
		const dataFechamento = contract.imcDtaFechamento
			? new Date(contract.imcDtaFechamento).toISOString().split('T')[0]
			: '';
		const dataFaturamento = contract.dataFaturamento
			? new Date(contract.dataFaturamento).toISOString().split('T')[0]
			: '';
		const taxaFechamento = contract.imcFltTxFec || null;
		const taxaPtaxDI = contract.taxaPtaxDI || null;

		let taxaSpotDoDia: number | null = null;
		if (contract.isAPrazo && dataFechamento) {
			try {
				taxaSpotDoDia = await fetchBCBPtaxVenda(dataFechamento);
			} catch { /* silencioso */ }
		}

		const taxaSpotNegociada = contract.isAPrazo && valorMoedaNegociada > 0 && valorMoedaNacional > 0
			? valorMoedaNacional / valorMoedaNegociada
			: null;

		return {
			...processInfo,
			moedaNegociada,
			valorMoedaNegociada,
			valorMoedaNacional,
			dataFechamento,
			dataConversao: '',
			dataFaturamento,
			prazoEmDias: defaultPrazoEmDias,
			vencimentoCliente: '',
			taxaFechamento,
			taxaPtaxDI,
			taxaSpotDoDia,
			taxaSpotNegociada,
			taxaFutura: null,
			cdiAoAno: null,
			spread: 0,
			encargosCalculados: 0,
		};
	}

	async function handleFetchCDI() {
		if (!activeTab) return;
		try {
			setLoadingBCBCDI(true);
			const latestCDI = await fetchBCBLatestCDI();
			if (latestCDI) {
				const annualRate = latestCDI.annualRate;
				const displayValue = taxaDeAnual(annualRate, activeTab.taxaPeriod);
				updateTab(activeTab.id, {
					taxaInputValue: displayValue,
					formState: {
						...activeTab.formState,
						cdiAoAno: annualRate,
						cdiMensal: latestCDI.monthlyRate,
					},
				});
				setShowSpread(true);
			} else {
				showError('Erro ao buscar CDI do BCB');
			}
		} catch {
			showError('Erro ao buscar CDI do BCB');
		} finally {
			setLoadingBCBCDI(false);
		}
	}

	function handleChangePeriod(tab: CalculatorTab, newPeriod: TaxaPeriod) {
		const currentAnual = tab.formState.cdiAoAno || 0;
		const newDisplayValue = currentAnual > 0 ? taxaDeAnual(currentAnual, newPeriod) : tab.taxaInputValue;
		updateTab(tab.id, { taxaPeriod: newPeriod, taxaInputValue: newDisplayValue ?? null });
	}

	function handleTaxaInputChange(tab: CalculatorTab, value: number | null) {
		const anual = value ? taxaParaAnual(value, tab.taxaPeriod) : null;
		updateTab(tab.id, {
			taxaInputValue: value,
			formState: { ...tab.formState, cdiAoAno: anual },
		});
	}

	function handleCalculate() {
		if (!activeTab) return;
		const fs = activeTab.formState;

		// Base para cálculo: prioriza valorMoedaNacional, fallback para valorMoedaNegociada
		const baseCalculo = fs.valorMoedaNacional > 0 ? fs.valorMoedaNacional : fs.valorMoedaNegociada;

		if (!fs.cdiAoAno || fs.prazoEmDias <= 0 || baseCalculo <= 0) {
			showError('Preencha os campos obrigatórios: Taxa aplicada, Prazo em dias e Valor base para cálculo.');
			return;
		}

		const taxaEfetiva = taxaEfetivaAnual(fs.cdiAoAno || 0, fs.spread || 0, activeTab.taxaPeriod, activeTab.iof);
		const encargo = calcularEncargos(baseCalculo, taxaEfetiva, fs.prazoEmDias);

		updateTab(activeTab.id, {
			calculated: true,
			formState: { ...fs, encargosCalculados: encargo, valorMoedaNacional: baseCalculo },
		});
	}

	function buildFormula(valorBase: number, taxaEfetiva: number, prazo: number, encargos: number): string {
		const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return `R$ ${fmt(valorBase)} × (${taxaEfetiva.toFixed(4)} / 360 / 100) × ${prazo} = R$ ${fmt(encargos)}`;
	}

	async function handleSubmit() {
		if (!process) return;
		const calculatedTabs = tabs.filter(t => t.formState.encargosCalculados > 0);
		if (calculatedTabs.length === 0) {
			showError('Calcule os encargos de pelo menos um item antes de enviar.');
			return;
		}

		try {
			setSubmitting(true);
			const totalInterest = calculatedTabs.reduce((sum, t) => sum + (t.formState.encargosCalculados || 0), 0);
			const totalValorBase = calculatedTabs.reduce((sum, t) => sum + (t.formState.valorMoedaNacional || 0), 0);
			const baseDates = calculatedTabs
				.map(t => getTabBaseDate(t))
				.filter(Boolean)
				.sort();
			const emissionDate = baseDates[0] || new Date().toISOString().split('T')[0];
			const firstTab = calculatedTabs[0];

			// 1. Montar items[] a partir dos tabs calculados
			const items: CalculationItem[] = calculatedTabs.map(t => {
				const fs = t.formState;
				const efetiva = taxaEfetivaAnual(fs.cdiAoAno || 0, fs.spread || 0, t.taxaPeriod, t.iof);

				const item: CalculationItem = {
					id: t.id,
					type: t.type,
					label: t.label,
					valorBase: fs.valorMoedaNacional || fs.valorMoedaNegociada || 0,
					moeda: fs.moedaNegociada || 'BRL',
					valorMoedaOriginal: fs.valorMoedaNegociada || undefined,
					prazoEmDias: fs.prazoEmDias || 0,
					dataBase: getTabBaseDate(t) || emissionDate,
					dataVencimento: fs.vencimentoCliente || '',
					cdiAoAno: fs.cdiAoAno || 0,
					spread: fs.spread || 0,
					taxaEfetiva: efetiva,
					iofValue: t.iof ? 0.38 : 0,
					baseDias: 360,
					encargosCalculados: fs.encargosCalculados,
					formula: buildFormula(
						fs.valorMoedaNacional || fs.valorMoedaNegociada || 0,
						efetiva,
						fs.prazoEmDias || 0,
						fs.encargosCalculados
					),
				};

				// Contract-specific fields
				if (t.type === 'contract') {
					item.taxaFechamento = fs.taxaFechamento;
					item.taxaPtaxDI = fs.taxaPtaxDI;
					item.taxaSpotDoDia = fs.taxaSpotDoDia;
					item.taxaSpotNegociada = fs.taxaSpotNegociada;
					item.taxaFutura = fs.taxaFutura;
				}

				// Expense-specific fields
				if (t.type === 'expense' && t.sourceData) {
					const expItems = Array.isArray(t.sourceData.items) ? t.sourceData.items : [];
					item.contasProjeto = Array.isArray(t.sourceData.projectAccounts) ? t.sourceData.projectAccounts : [];

					const detalhes = expItems.map((e: any) => ({
						contaProjeto: e.ctpDesNome || '',
						encargo: e.impDesNome || '',
						dataConversao: toIsoDate(e.pidDtaTaxas) || '',
						valorBRL: Number(e.pidMnyValormn || e.pidMnyValorMneg || 0),
					}));

					// Calcular encargos proporcionais por lançamento
					const totalValorDetalhes = detalhes.reduce((sum: number, d: any) => sum + d.valorBRL, 0);
					item.detalhesDespesa = detalhes.map((d: any) => ({
						...d,
						encargosProporcionais: totalValorDetalhes > 0
							? item.encargosCalculados * (d.valorBRL / totalValorDetalhes)
							: 0,
					}));
				}


				// Comercialização — delta breakdown
				if (t.type === 'tax_comercializacao' && t.sourceData) {
					const deltas = (t.sourceData.deltas || []) as ComercializacaoDelta[];
					const selected = deltas.filter(d => selectedComercializacao.has(d.taxName));
					const totalDelta = selected.reduce((s, d) => s + d.delta, 0);
					item.contasProjeto = [];
					item.detalhesDespesa = selected.map(d => ({
						contaProjeto: '',
						encargo: d.taxName,
						dataConversao: '',
						valorBRL: d.delta,
						valorFull: d.valorFull,
						valorNacionalizacao: d.valorNacionalizacao,
						isDelta: true,
						encargosProporcionais: totalDelta > 0
							? item.encargosCalculados * (d.delta / totalDelta)
							: 0,
					}));
				}

				// IMPOSTOS (DI) — valores diretos
				if (t.type === 'tax_di' && t.sourceData) {
					const diItems = (t.sourceData.diTaxes || []) as ConsolidatedTaxItem[];
					const selected = diItems.filter(imp => selectedDI.has(imp.impDesNome));
					const totalSel = selected.reduce((s, imp) => s + (imp.dtrMnyValormn ?? 0), 0);
					item.contasProjeto = [];
					item.detalhesDespesa = selected.map(imp => ({
						contaProjeto: '',
						encargo: imp.impDesNome,
						dataConversao: '',
						valorBRL: imp.dtrMnyValormn ?? 0,
						encargosProporcionais: totalSel > 0
							? item.encargosCalculados * ((imp.dtrMnyValormn ?? 0) / totalSel)
							: 0,
					}));
				}
				return item;
			});

			// 2. Montar payload v2 completo
			const raw = (process as any)?.raw || process;
			const payload: CalculationPayloadV2 = {
				payloadVersion: 2,
				processId,
				processoNumero: process.processNumber || process.priEspRefcliente || '',
				clienteId: String(process.priCod || processId),
				clienteNome: firstTab.formState.nomeCliente || process.clientName || '',
				refExterna: firstTab.formState.refExterna || process.priEspRefcliente || '',
				emissionDate,
				items,
				totalEncargos: totalInterest,
				totalValorBase,
				calculadoEm: new Date().toISOString(),
				filCod,
			};

			// 3. Salvar cálculo no banco ANTES de submeter ao Conexos
			const savedCalc = await saveCalculationV2(payload);
			const calculationId = savedCalc?.id;

			// 4. Submeter ao Conexos usando o UUID do cálculo salvo
			// encargosCalculados já está em BRL — taxaDolarFiscal deve ser 1 para evitar dupla conversão
			// filCod é obrigatório quando o processo não está na filial padrão (priCod escopado a filial)
			await submitToConexos(calculationId || processId, {
				processId,
				emissionDate,
				totalInterest,
				taxaDolarFiscal: 1,
				filCod,
			});

			showSuccess('Encargos financeiros enviados ao Conexos com sucesso!');
			await loadProcessData();
		} catch (err: any) {
			showError('Erro ao enviar para o Conexos: ' + (err.message || 'Erro desconhecido'));
		} finally {
			setSubmitting(false);
		}
	}

	// ─── Render helpers ───────────────────────────────────────────────────────

	function renderInfoField(label: string, value: string) {
		return (
			<div>
				<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</Label>
				<p className="mt-1 text-sm font-medium text-gray-900">{value || '—'}</p>
			</div>
		);
	}

	function renderContractForm(tab: CalculatorTab) {
		const fs = tab.formState;
		const enriched = tab.enrichedContract;
		const isAVista = enriched?.isAVista ?? false;

		return (
			<div className="space-y-4">
				{/* Processo + Contrato em grid horizontal */}
				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Processo</CardTitle>
					</CardHeader>
					<CardContent className="pt-4">
						<div className="grid grid-cols-4 gap-x-6 gap-y-4">
							{renderInfoField('Referência', fs.refExterna)}
							{renderInfoField('Cliente', fs.nomeCliente)}
							{renderInfoField('Incoterm', fs.incoterm)}
							{renderInfoField('Moeda', fs.moedaNegociada)}
							{renderInfoField('Prazo Conexos (dupNumDiasVcto)', formatConexosBillingTerm(process?.billingTermDays))}
						</div>
					</CardContent>
				</Card>

				<div className="grid grid-cols-2 gap-4">
					{/* Contrato */}
					<Card>
						<CardHeader className="bg-gray-50 border-b py-3">
							<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Contrato de Câmbio</CardTitle>
						</CardHeader>
						<CardContent className="pt-4 space-y-4">
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Fechamento</Label>
								<Input type="date" value={fs.dataFechamento} disabled className="bg-gray-50 mt-1" />
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Vencimento</Label>
								<Input type="date" value={fs.vencimentoCliente || ''} disabled className="bg-gray-50 mt-1" />
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Prazo (em dias) *</Label>
								<Input
									type="number"
									value={fs.prazoEmDias || ''}
									onChange={(e) => updateTabFormState(tab.id, prev => ({
										...prev, prazoEmDias: parseInt(e.target.value, 10) || 0
									}))}
									className="border-blue-400 mt-1"
									placeholder="Ex: 30"
								/>
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vlr. Contrato ({fs.moedaNegociada})</Label>
								<NumericFormat
									customInput={Input}
									thousandSeparator="." decimalSeparator="," decimalScale={2} fixedDecimalScale allowNegative={false}
									value={fs.valorMoedaNegociada || ''}
									onValueChange={(values) => {
										const val = values.floatValue || 0;
										const taxa = (fs.taxaFechamento ?? fs.taxaSpotNegociada ?? fs.taxaFutura) ?? 0;
										updateTabFormState(tab.id, prev => ({
											...prev,
											valorMoedaNegociada: val,
											valorMoedaNacional: taxa > 0 && val > 0 ? val * taxa : prev.valorMoedaNacional
										}));
									}}
									className="border-blue-400 mt-1" placeholder="Ex: 50.000,00"
								/>
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vlr. Nacional (BRL)</Label>
								<Input
									value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fs.valorMoedaNacional)}
									disabled className="bg-gray-50 font-semibold mt-1"
								/>
							</div>
						</CardContent>
					</Card>

					{/* Taxas */}
					<Card>
						<CardHeader className="bg-gray-50 border-b py-3">
							<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Taxas do Contrato</CardTitle>
						</CardHeader>
						<CardContent className="pt-4 space-y-4">
							{isAVista ? (
								<div>
									<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Taxa Fechamento (câmbio)</Label>
									<Input
										type="number" step="0.0001"
										value={fs.taxaFechamento ?? ''}
										disabled className="bg-gray-50 font-semibold mt-1"
									/>
								</div>
							) : (
								<>
									<div>
										<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Taxa Ptax da D.I (Conexos)</Label>
										<Input value={fs.taxaPtaxDI?.toFixed(4) || '0.0000'} disabled className="bg-gray-50 mt-1" />
										{!fs.taxaPtaxDI && <p className="text-xs text-blue-600 mt-1">⚠ Taxa Ptax D.I não disponível</p>}
									</div>
									<div>
										<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Taxa Spot do dia (BCB)</Label>
										<div className="flex gap-2 mt-1">
											<Input value={fs.taxaSpotDoDia?.toFixed(4) || '0.0000'} disabled className="bg-gray-50" />
											<Button variant="outline" size="sm" onClick={async () => {
												if (fs.dataFechamento) {
													const rate = await fetchBCBPtaxVenda(fs.dataFechamento);
													if (rate) updateTabFormState(tab.id, prev => ({ ...prev, taxaSpotDoDia: rate }));
												}
											}}>Atualizar</Button>
										</div>
									</div>
									<div>
										<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Taxa Spot Negociada *</Label>
										<Input
											type="number" step="0.0001"
											value={fs.taxaSpotNegociada || ''}
											onChange={(e) => {
												const taxa = parseFloat(e.target.value) || null;
												const valorUSD = fs.valorMoedaNegociada ?? 0;
												updateTabFormState(tab.id, prev => ({
													...prev, taxaSpotNegociada: taxa,
													valorMoedaNacional: taxa && taxa > 0 && valorUSD > 0 ? valorUSD * taxa : prev.valorMoedaNacional
												}));
											}}
											className="border-blue-400 mt-1" placeholder="Ex: 5.5000"
										/>
									</div>
									<div>
										<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Taxa Futura *</Label>
										<Input
											type="number" step="0.0001"
											value={fs.taxaFutura || ''}
											onChange={(e) => {
												const taxa = parseFloat(e.target.value) || null;
												const valorUSD = fs.valorMoedaNegociada ?? 0;
												updateTabFormState(tab.id, prev => ({
													...prev, taxaFutura: taxa,
													valorMoedaNacional: taxa && taxa > 0 && valorUSD > 0 ? valorUSD * taxa : prev.valorMoedaNacional
												}));
											}}
											className="border-blue-400 mt-1" placeholder="Ex: 5.6000"
										/>
									</div>
								</>
							)}
						</CardContent>
					</Card>
				</div>

				{renderCalculationSection(tab)}
			</div>
		);
	}

	function renderExpenseForm(tab: CalculatorTab) {
		const fs = tab.formState;
		const expGroup = tab.sourceData;
		const items = Array.isArray(expGroup?.items) ? expGroup.items : [];
		const projectAccounts = Array.isArray(expGroup?.projectAccounts) ? expGroup.projectAccounts : [];
		const activeItems = items.filter((e: any) => String(e.pidVldStatus) === '1').length;
		const statusGroup = activeItems > 0 ? 'Ativa' : 'Inativa';

		return (
			<div className="space-y-4">
				{/* Info compacta */}
				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Despesa</CardTitle>
					</CardHeader>
					<CardContent className="pt-4">
						<div className="grid grid-cols-3 gap-x-6 gap-y-4">
							{renderInfoField('Referência', fs.refExterna)}
							{renderInfoField('Cliente', fs.nomeCliente)}
							{renderInfoField('Conta(s) de Projeto', projectAccounts.length > 0 ? projectAccounts.join(', ') : '—')}
							{renderInfoField('Encargo', expGroup.encargo || tab.label || '—')}
							{renderInfoField('Moeda', fs.moedaNegociada)}
							{renderInfoField('Situação', statusGroup)}
							{renderInfoField('Prazo Conexos (dupNumDiasVcto)', formatConexosBillingTerm(process?.billingTermDays))}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Detalhamento do Grupo</CardTitle>
					</CardHeader>
					<CardContent className="pt-4">
						<details className="rounded border border-gray-200 p-3">
							<summary className="cursor-pointer text-sm font-medium text-gray-700">
								Ver {items.length} lançamento(s) que compõem "{expGroup.encargo || tab.label}"
							</summary>
							<div className="mt-3 overflow-x-auto">
								<table className="w-full text-xs">
									<thead>
										<tr className="border-b border-gray-100">
											<th className="text-left py-2">Conta Projeto</th>
											<th className="text-left py-2">Encargo</th>
											<th className="text-left py-2">Data Conversão</th>
											<th className="text-right py-2">Valor (BRL)</th>
										</tr>
									</thead>
									<tbody>
										{items.map((item: any, idx: number) => (
											<tr key={idx} className="border-b border-gray-50">
												<td className="py-2">{item.ctpDesNome || '—'}</td>
												<td className="py-2">{item.impDesNome || '—'}</td>
												<td className="py-2">{toIsoDate(item.pidDtaTaxas) || '—'}</td>
												<td className="py-2 text-right">{formatBRL(Number(item.pidMnyValormn || item.pidMnyValorMneg || 0))}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</details>
					</CardContent>
				</Card>

				{/* Valores editáveis */}
				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Valores e Prazo</CardTitle>
					</CardHeader>
					<CardContent className="pt-4">
						<div className="grid grid-cols-5 gap-4">
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Conversão</Label>
								<Input type="date" value={fs.dataConversao || ''} disabled className="bg-gray-50 mt-1" />
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Prazo (em dias) *</Label>
								<Input
									type="number"
									value={fs.prazoEmDias || ''}
									onChange={(e) => updateTabFormState(tab.id, prev => ({
										...prev, prazoEmDias: parseInt(e.target.value, 10) || 0
									}))}
									className="border-blue-400 mt-1" placeholder="Ex: 30"
								/>
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Vencimento</Label>
								<Input type="date" value={fs.vencimentoCliente || ''} disabled className="bg-gray-50 mt-1" />
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vlr. Moeda Negociada</Label>
								<NumericFormat
									customInput={Input}
									thousandSeparator="." decimalSeparator="," decimalScale={2} fixedDecimalScale allowNegative={false}
									value={fs.valorMoedaNegociada || ''}
									onValueChange={(values) => updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNegociada: values.floatValue || 0 }))}
									className="border-blue-400 mt-1" placeholder="Ex: 50.000,00"
								/>
							</div>
							<div>
								<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vlr. Moeda Nacional (BRL)</Label>
								<NumericFormat
									customInput={Input}
									thousandSeparator="." decimalSeparator="," decimalScale={2} fixedDecimalScale allowNegative={false}
									value={fs.valorMoedaNacional || ''}
									onValueChange={(values) => updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNacional: values.floatValue || 0 }))}
									className="border-blue-400 mt-1" placeholder="Ex: 50.000,00"
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				{renderCalculationSection(tab)}
			</div>
		);
	}

	function renderComercializacaoForm(tab: CalculatorTab) {
		const fs = tab.formState;
		const deltas = (tab.sourceData?.deltas || []) as ComercializacaoDelta[];

		const allSelected = deltas.length > 0 && deltas.every(d => selectedComercializacao.has(d.taxName));
		const someSelected = deltas.some(d => selectedComercializacao.has(d.taxName));

		function toggleComerc(taxName: string) {
			const next = new Set(selectedComercializacao);
			if (next.has(taxName)) next.delete(taxName); else next.add(taxName);
			setSelectedComercializacao(next);
			const newBase = deltas.filter(d => next.has(d.taxName)).reduce((s, d) => s + d.delta, 0);
			updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNacional: newBase }));
		}

		function toggleAllComerc() {
			if (allSelected) {
				setSelectedComercializacao(new Set());
				updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNacional: 0 }));
			} else {
				const all = new Set(deltas.map(d => d.taxName));
				setSelectedComercializacao(all);
				const newBase = deltas.reduce((s, d) => s + d.delta, 0);
				updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNacional: newBase }));
			}
		}

		const totalSelectedDelta = deltas
			.filter(d => selectedComercializacao.has(d.taxName))
			.reduce((s, d) => s + d.delta, 0);

		return (
			<div className="space-y-4">
				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Comercialização</CardTitle>
					</CardHeader>
					<CardContent className="pt-4">
						<div className="grid grid-cols-3 gap-x-6 gap-y-4">
							{renderInfoField('Referência', fs.refExterna)}
							{renderInfoField('Cliente', fs.nomeCliente)}
							{renderInfoField('Prazo Conexos (dupNumDiasVcto)', formatConexosBillingTerm(process?.billingTermDays))}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<div className="flex items-center justify-between">
							<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
								Delta de Impostos (Saída − Nacionalização)
							</CardTitle>
							<Button variant="ghost" size="sm" onClick={toggleAllComerc} className="text-xs">
								{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
							</Button>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
										<th className="py-3 pr-3 w-8"></th>
										<th className="text-left py-3">Imposto</th>
										<th className="text-right py-3 pr-4">Valor Total (R$)</th>
										<th className="text-right py-3 pr-4">Nacionalização (R$)</th>
										<th className="text-right py-3">Delta (R$)</th>
									</tr>
								</thead>
								<tbody>
									{deltas.map((d) => {
										const checked = selectedComercializacao.has(d.taxName);
										return (
											<tr
												key={d.taxName}
												className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${checked ? 'bg-blue-50' : ''}`}
												onClick={() => toggleComerc(d.taxName)}
											>
												<td className="py-2 pr-3">
													<input
														type="checkbox"
														checked={checked}
														onChange={() => toggleComerc(d.taxName)}
														onClick={(e) => e.stopPropagation()}
														className="h-4 w-4 rounded border-gray-300 text-blue-600"
													/>
												</td>
												<td className="py-2 font-medium text-gray-800">{d.taxName}</td>
												<td className="py-2 pr-4 text-right">{formatBRL(d.valorFull)}</td>
												<td className="py-2 pr-4 text-right text-gray-600">
													{d.valorNacionalizacao > 0 ? formatBRL(d.valorNacionalizacao) : 'N/A'}
												</td>
												<td className="py-2 text-right font-semibold text-blue-700">{formatBRL(d.delta)}</td>
											</tr>
										);
									})}
								</tbody>
								{someSelected && (
									<tfoot>
										<tr className="border-t-2 border-blue-200 bg-blue-50 font-semibold text-blue-800">
											<td></td>
											<td className="py-2 text-sm">Total Selecionado</td>
											<td></td>
											<td></td>
											<td className="py-2 text-right">{formatBRL(totalSelectedDelta)}</td>
										</tr>
									</tfoot>
								)}
							</table>
						</div>
					</CardContent>
				</Card>

				{renderTaxExposureCard(tab)}

				{renderCalculationSection(tab)}
			</div>
		);
	}

	function renderDIForm(tab: CalculatorTab) {
		const fs = tab.formState;
		const diTaxes = (tab.sourceData?.diTaxes || []) as ConsolidatedTaxItem[];

		const allSelected = diTaxes.length > 0 && diTaxes.every(t => selectedDI.has(t.impDesNome));
		const someSelected = diTaxes.some(t => selectedDI.has(t.impDesNome));

		function toggleDI(name: string) {
			const next = new Set(selectedDI);
			if (next.has(name)) next.delete(name); else next.add(name);
			setSelectedDI(next);
			const newBase = diTaxes
				.filter(t => next.has(t.impDesNome))
				.reduce((sum, t) => sum + (t.dtrMnyValormn ?? 0), 0);
			updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNacional: newBase }));
		}

		function toggleAllDI() {
			if (allSelected) {
				setSelectedDI(new Set());
				updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNacional: 0 }));
			} else {
				const all = new Set(diTaxes.map(t => t.impDesNome));
				setSelectedDI(all);
				const newBase = diTaxes.reduce((sum, t) => sum + (t.dtrMnyValormn ?? 0), 0);
				updateTabFormState(tab.id, prev => ({ ...prev, valorMoedaNacional: newBase }));
			}
		}

		const totalSelectedBRL = diTaxes
			.filter(t => selectedDI.has(t.impDesNome))
			.reduce((sum, t) => sum + (t.dtrMnyValormn ?? 0), 0);

		return (
			<div className="space-y-4">
				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">IMPOSTOS (DI)</CardTitle>
					</CardHeader>
					<CardContent className="pt-4">
						<div className="grid grid-cols-3 gap-x-6 gap-y-4">
							{renderInfoField('Referência', fs.refExterna)}
							{renderInfoField('Cliente', fs.nomeCliente)}
							{renderInfoField('Prazo Conexos (dupNumDiasVcto)', formatConexosBillingTerm(process?.billingTermDays))}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<div className="flex items-center justify-between">
							<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
								Impostos da Declaração de Importação
							</CardTitle>
							<Button variant="ghost" size="sm" onClick={toggleAllDI} className="text-xs">
								{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
							</Button>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
										<th className="py-3 pr-3 w-8"></th>
										<th className="text-left py-3">Imposto</th>
										<th className="text-right py-3 pr-4">Alíquota</th>
										<th className="text-right py-3">Valor (R$)</th>
									</tr>
								</thead>
								<tbody>
									{diTaxes.map((imp) => {
										const checked = selectedDI.has(imp.impDesNome);
										return (
											<tr
												key={imp.impDesNome}
												className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${checked ? 'bg-blue-50' : ''}`}
												onClick={() => toggleDI(imp.impDesNome)}
											>
												<td className="py-2 pr-3">
													<input
														type="checkbox"
														checked={checked}
														onChange={() => toggleDI(imp.impDesNome)}
														onClick={(e) => e.stopPropagation()}
														className="h-4 w-4 rounded border-gray-300 text-blue-600"
													/>
												</td>
												<td className="py-2 font-medium text-gray-800">{imp.impDesNome}</td>
												<td className="py-2 pr-4 text-right text-gray-600">
													{imp.dtrPctAliquota != null ? (
														<span className="inline-flex items-center gap-1">
															{imp.dtrPctAliquota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
															{imp.aliquotas && imp.aliquotas.length > 1 && (
																<span title={`Alíquotas variam entre NFs: ${imp.aliquotas.map(a => a + '%').join(', ')}`}>
																	<Info className="h-3 w-3 text-blue-500 cursor-help" />
																</span>
															)}
														</span>
													) : '—'}
												</td>
												<td className="py-2 text-right">{formatBRL(imp.dtrMnyValormn ?? 0)}</td>
											</tr>
										);
									})}
								</tbody>
								{someSelected && (
									<tfoot>
										<tr className="border-t-2 border-blue-200 bg-blue-50 font-semibold text-blue-800">
											<td></td>
											<td className="py-2 text-sm">Total Selecionado</td>
											<td></td>
											<td className="py-2 text-right">{formatBRL(totalSelectedBRL)}</td>
										</tr>
									</tfoot>
								)}
							</table>
						</div>
					</CardContent>
				</Card>

				{renderTaxExposureCard(tab)}

				{renderCalculationSection(tab)}
			</div>
		);
	}

	function renderTaxExposureCard(tab: CalculatorTab) {
		const fs = tab.formState;
		return (
			<Card>
				<CardHeader className="bg-gray-50 border-b py-3">
					<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Prazo de Exposição</CardTitle>
				</CardHeader>
				<CardContent className="pt-4">
					<div className="grid grid-cols-4 gap-4">
						<div>
							<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Desembolso Imposto</Label>
							<Input
								type="date"
								value={fs.dataDesembolsoImposto || ''}
								onChange={(e) => updateTabFormState(tab.id, prev => ({
									...prev, dataDesembolsoImposto: e.target.value
								}))}
								className="border-blue-400 mt-1"
							/>
							{!fs.dataDesembolsoImposto && (
								<p className="text-xs text-amber-600 mt-1">Não encontrado no Conexos</p>
							)}
						</div>
						<div>
							<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Prazo (em dias) *</Label>
							<Input
								type="number"
								value={fs.prazoEmDias || ''}
								onChange={(e) => updateTabFormState(tab.id, prev => ({
									...prev, prazoEmDias: parseInt(e.target.value, 10) || 0
								}))}
								className="border-blue-400 mt-1" placeholder="Ex: 30"
							/>
						</div>
						<div>
							<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Vencimento</Label>
							<Input type="date" value={fs.vencimentoCliente || ''} disabled className="bg-gray-50 mt-1" />
						</div>
						<div>
							<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Base (BRL)</Label>
							<Input
								value={fs.valorMoedaNacional > 0 ? formatBRL(fs.valorMoedaNacional) : ''}
								disabled
								className="bg-gray-50 mt-1"
								placeholder="Selecione impostos acima"
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	function renderCalculationSection(tab: CalculatorTab) {
		const fs = tab.formState;
		const taxaAnual = taxaEfetivaAnual(fs.cdiAoAno || 0, fs.spread || 0, tab.taxaPeriod, tab.iof);

		return (
			<Card>
				<CardHeader className="bg-gray-50 border-b py-3">
					<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Cálculo de Encargos</CardTitle>
				</CardHeader>
				<CardContent className="pt-4 space-y-4">
					{/* Taxa row */}
					<div>
						<Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
							Taxa aplicada ({PERIOD_LABELS[tab.taxaPeriod]}) *
						</Label>
						<div className="flex gap-2 mt-1">
							<NumericFormat
								customInput={Input}
								decimalSeparator=","
								decimalScale={6}
								allowNegative={false}
								value={tab.taxaInputValue ?? ''}
								onValueChange={(values) => handleTaxaInputChange(tab, values.floatValue ?? null)}
								className="border-blue-400 flex-1"
								placeholder="Ex: 10,5"
							/>
							<select
								value={tab.taxaPeriod}
								onChange={(e) => handleChangePeriod(tab, e.target.value as TaxaPeriod)}
								className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
							>
								<option value="anual">Anual</option>
								<option value="mensal">Mensal</option>
								<option value="diario">Diário</option>
							</select>
							<Button
								variant="outline" size="sm"
								onClick={handleFetchCDI}
								disabled={loadingBCBCDI}
							>
								{loadingBCBCDI ? <Spinner className="w-4 h-4" /> : 'Buscar CDI'}
							</Button>
						</div>
						{fs.cdiAoAno && tab.taxaPeriod !== 'anual' && (
							<p className="text-xs text-blue-600 mt-1">
								Equivale a {fs.cdiAoAno.toFixed(4)}% ao ano
							</p>
						)}
					</div>

					{/* Spread — aparece após buscar CDI */}
					{showSpread && (
						<div className="bg-blue-50 border border-blue-100 p-3 rounded-lg space-y-2">
							<Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Spread (adicional ao CDI)</Label>
							<div className="flex items-center gap-3">
							<span className="text-sm font-medium text-gray-700 whitespace-nowrap">CDI +</span>
							<NumericFormat
								customInput={Input}
								decimalSeparator=","
								decimalScale={4}
								allowNegative={false}
								value={fs.spread || ''}
								onValueChange={(values) => updateTabFormState(tab.id, prev => ({
									...prev, spread: values.floatValue || 0
								}))}
								className="border-blue-400 w-28"
								placeholder="0,0000"
							/>
							<span className="text-sm text-gray-500 whitespace-nowrap">% {PERIOD_SHORT[tab.taxaPeriod]}</span>
							</div>
							<div className="flex items-center justify-between pt-1">
								<label className="flex items-center gap-2 cursor-pointer">
									<input
										type="checkbox"
										checked={tab.iof}
										onChange={(e) => updateTab(tab.id, { iof: e.target.checked })}
										className="w-4 h-4 text-blue-600 rounded border-gray-300"
									/>
									<span className="text-sm text-gray-700">IOF (+ 0,38% a.a.)</span>
								</label>
								<span className="text-sm font-semibold text-blue-700 whitespace-nowrap">
									Taxa efetiva: {taxaAnual.toFixed(4)}% a.a.
									{tab.iof && <span className="text-xs text-gray-500 ml-1">(CDI + Spread + IOF)</span>}
								</span>
							</div>
						</div>
					)}

					<Button
						onClick={handleCalculate}
						className="w-full bg-[#337ab7] hover:bg-blue-700 text-white"
						size="lg"
						disabled={!fs.cdiAoAno || fs.prazoEmDias <= 0}
					>
						Calcular Encargos
					</Button>

					{fs.encargosCalculados > 0 && (
						<div className="space-y-3">
							<div className="border border-blue-200 bg-white p-4 rounded-lg">
								<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Encargos Calculados</p>
								<p className="text-3xl font-bold text-[#337ab7]">
									{formatBRL(fs.encargosCalculados)}
								</p>
								<div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 border-t border-gray-100 pt-3">
									<p>CDI Diária: {fs.cdiMensal ? (fs.cdiMensal / 30).toFixed(6) : fs.cdiAoAno ? (fs.cdiAoAno / 360).toFixed(6) : '0'}%</p>
									<p>Prazo: {fs.prazoEmDias} dias</p>
									<p>Base: {formatBRL(fs.valorMoedaNacional)}</p>
									<p>Taxa: {taxaAnual.toFixed(4)}% a.a.</p>
								</div>
								<p className="mt-3 text-xs font-mono text-gray-400">
									Valor × (Taxa / 360 / 100) × Prazo
								</p>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		);
	}

	function renderOverview() {
		const totalEncargos = tabs.reduce((sum, t) => sum + t.formState.encargosCalculados, 0);
		const calculatedCount = tabs.filter(t => t.calculated).length;
		const contractCount = tabs.filter(t => t.type === 'contract').length;
		const expenseCount = tabs.filter(t => t.type === 'expense').length;
		const taxCount = tabs.filter(t => t.type === 'tax_comercializacao' || t.type === 'tax_di').length;

		return (
			<div className="space-y-6">
				<div className="grid grid-cols-3 gap-4">
					<Card className="border-blue-200">
						<CardContent className="pt-4 text-center">
							<p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total de Itens</p>
							<p className="text-3xl font-bold text-[#337ab7] mt-1">{tabs.length}</p>
							<p className="text-xs text-gray-400 mt-1">
								{contractCount} contratos · {expenseCount} despesas{taxCount > 0 ? ` · ${taxCount} impostos` : ''}
							</p>
						</CardContent>
					</Card>
					<Card className="border-blue-200">
						<CardContent className="pt-4 text-center">
							<p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Calculados</p>
							<p className="text-3xl font-bold text-[#337ab7] mt-1">{calculatedCount} / {tabs.length}</p>
						</CardContent>
					</Card>
					<Card className="border-blue-200">
						<CardContent className="pt-4 text-center">
							<p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Encargos</p>
							<p className="text-2xl font-bold text-[#337ab7] mt-1">{formatBRL(totalEncargos)}</p>
						</CardContent>
					</Card>
				</div>

				<Card>
					<CardHeader className="bg-gray-50 border-b py-3">
						<CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Visão Consolidada</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<table className="w-full">
							<thead>
								<tr className="bg-gray-50/80 border-b border-gray-200">
									<th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Item</th>
									<th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tipo</th>
									<th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Valor Base</th>
									<th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Encargos</th>
									<th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100">
								{tabs.map(tab => (
									<tr
										key={tab.id}
										className="hover:bg-blue-50/30 cursor-pointer transition-colors"
										onClick={() => setActiveTabId(tab.id)}
									>
										<td className="px-4 py-3 text-sm font-medium text-gray-800">{tab.label}</td>
										<td className="px-4 py-3">
											<span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
												'bg-blue-50 text-blue-700'
											}`}>
												{tab.type === 'contract' ? 'Contrato' :
												 tab.type === 'tax_comercializacao' ? 'Comercialização' :
												 tab.type === 'tax_di' ? 'Impostos (DI)' :
												 'Despesa'}
											</span>
										</td>
										<td className="px-4 py-3 text-sm text-right text-gray-700">
											{formatBRL(tab.formState.valorMoedaNacional)}
										</td>
										<td className="px-4 py-3 text-sm text-right font-semibold text-[#337ab7]">
											{tab.calculated ? formatBRL(tab.formState.encargosCalculados) : '—'}
										</td>
										<td className="px-4 py-3 text-center">
											{tab.calculated
												? <CheckCircle2 className="w-4 h-4 text-[#337ab7] mx-auto" />
												: <span className="text-[10px] text-gray-400">Pendente</span>
											}
										</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr className="bg-gray-50 border-t-2 border-gray-200">
									<td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-700 text-right">
										Total de Encargos:
									</td>
									<td className="px-4 py-3 text-sm text-right font-bold text-[#337ab7]">
										{formatBRL(totalEncargos)}
									</td>
									<td />
								</tr>
							</tfoot>
						</table>
					</CardContent>
				</Card>

				<div className="flex gap-4">
					<Button
						onClick={handleSubmit}
						disabled={totalEncargos <= 0 || submitting}
						className="flex-1 bg-[#337ab7] hover:bg-blue-700 text-white disabled:opacity-40"
						size="lg"
					>
						{submitting ? <Spinner className="w-4 h-4 mr-2" /> : null}
						Enviar para Conexos
					</Button>
					<Button variant="outline" onClick={() => window.print()} size="lg">
						Exportar PDF
					</Button>
				</div>
			</div>
		);
	}

	// ─── Main render ──────────────────────────────────────────────────────────

	if (loading) {
		return (
			<ProtectedRoute>
				<div className="flex items-center justify-center min-h-screen">
					<Spinner className="w-8 h-8" />
					<span className="ml-3 text-gray-600">Carregando...</span>
				</div>
			</ProtectedRoute>
		);
	}

	if (!process) {
		return (
			<ProtectedRoute>
				<div className="p-6 max-w-6xl mx-auto">
					<Alert>
						<AlertDescription>Processo não encontrado</AlertDescription>
					</Alert>
					<Button onClick={() => router.back()} className="mt-4">
						<ArrowLeft className="w-4 h-4 mr-2" />
						Voltar
					</Button>
				</div>
			</ProtectedRoute>
		);
	}

	return (
		<ProtectedRoute>
			<div className="p-6 max-w-6xl mx-auto">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="sm" onClick={() => router.back()}>
							<ArrowLeft className="w-4 h-4 mr-2" />
							Voltar
						</Button>
						<div>
							<h1 className="text-2xl font-bold text-gray-900">Cálculo de Encargos</h1>
							<p className="text-gray-500 text-sm">
								{tabs[0]?.formState.refExterna || processId} · {tabs[0]?.formState.nomeCliente || ''}
							</p>
						</div>
					</div>
				</div>

				{tabs.length === 0 ? (
					<Alert>
						<AlertDescription>Nenhum contrato ou despesa encontrado para este processo.</AlertDescription>
					</Alert>
				) : (
					<Tabs value={activeTabId} onValueChange={setActiveTabId}>
						<TabsList className="w-full flex overflow-x-auto mb-4 h-auto flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
							{tabs.map(tab => (
								<TabsTrigger
									key={tab.id}
									value={tab.id}
									className="gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#337ab7] data-[state=active]:shadow-sm"
								>
									{tab.type === 'contract'
										? <DollarSign className="w-3.5 h-3.5 shrink-0" />
										: (tab.type === 'tax_comercializacao' || tab.type === 'tax_di')
										? <Receipt className="w-3.5 h-3.5 shrink-0" />
										: <FileText className="w-3.5 h-3.5 shrink-0" />
									}
									<span className="text-xs">{tab.label}</span>
									{tab.calculated && <CheckCircle2 className="w-3 h-3 text-[#337ab7] shrink-0" />}
								</TabsTrigger>
							))}
							<TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-[#337ab7] data-[state=active]:shadow-sm">
								<span className="text-xs font-bold">Resumo</span>
							</TabsTrigger>
						</TabsList>

						{tabs.map(tab => (
							<TabsContent key={tab.id} value={tab.id}>
								{tab.type === 'contract'
									? renderContractForm(tab)
									: tab.type === 'tax_comercializacao'
									? renderComercializacaoForm(tab)
									: tab.type === 'tax_di'
									? renderDIForm(tab)
									: renderExpenseForm(tab)
								}
							</TabsContent>
						))}

						<TabsContent value="overview">
							{renderOverview()}
						</TabsContent>
					</Tabs>
				)}
			</div>
		</ProtectedRoute>
	);
}
