"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Process, CalculationResult, EnrichedContractData, CalculatorFormState } from "@/lib/types";
import {
	fetchProcess,
	fetchContractsByProcess,
	fetchEnrichedContractData,
	fetchBCBLatestCDI,
	fetchBCBPtaxVenda,
	calculateCharges,
	submitToConexos,
} from "@/lib/api";
import { calcularEncargos, calcularVariacaoCambial } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtectedRoute } from "@/components/protected-route";
import { ArrowLeft } from "lucide-react";

export default function ProcessCalculatorPage() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const processId = params.id as string;
	const contractIdParam = searchParams.get('contractId');

	// State
	const [process, setProcess] = useState<Process | null>(null);
	const [contracts, setContracts] = useState<any[]>([]);
	const [selectedContract, setSelectedContract] = useState<EnrichedContractData | null>(null);
	const [loading, setLoading] = useState(true);
	const [calculating, setCalculating] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [loadingBCBCDI, setLoadingBCBCDI] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<CalculationResult | null>(null);

	// Form state seguindo estrutura de 3 decks
	const [formState, setFormState] = useState<CalculatorFormState>({
		// Deck 1: Process
		refExterna: '',
		nomeCliente: '',
		incoterm: '',
		moedaNegociada: '',
		valorMoedaNegociada: 0,
		valorMoedaNacional: 0,

		// Deck 2: Contract
		dataFechamento: '',
		dataFaturamento: '',
		prazoEmDias: 0,
		vencimentoCliente: '',

		// Deck 3: Rates
		taxaFechamento: null,
		taxaPtaxDI: null,
		taxaSpotDoDia: null,
		taxaSpotNegociada: null,
		taxaFutura: null,

		// Calculation
		cdiAoAno: null,
		encargosCalculados: 0,
	});

	// Load process and contracts on mount
	useEffect(() => {
		loadProcessData();
	}, [processId]);

	// Calculate "Vencimento Cliente" when dataFaturamento or prazoEmDias changes
	useEffect(() => {
		if (formState.dataFaturamento && formState.prazoEmDias > 0) {
			const dataFat = new Date(formState.dataFaturamento);
			dataFat.setDate(dataFat.getDate() + formState.prazoEmDias);
			setFormState(prev => ({
				...prev,
				vencimentoCliente: dataFat.toISOString().split('T')[0]
			}));
		} else {
			setFormState(prev => ({ ...prev, vencimentoCliente: '' }));
		}
	}, [formState.dataFaturamento, formState.prazoEmDias]);

	async function loadProcessData() {
		try {
			setLoading(true);
			setError(null);

			const data = await fetchProcess(processId);
			const processData = data.process;
			setProcess(processData);

			// Load contracts
			const priCod = processData?.priCod || parseInt(processId, 10);
			if (!isNaN(priCod)) {
				const contractsData = await fetchContractsByProcess(priCod);
				setContracts(contractsData || []);

				// Auto-select contract if provided in URL or select first
				let contractToLoad = null;
				if (contractIdParam && contractsData.length > 0) {
					contractToLoad = contractsData.find((c: any) => String(c.imcCod) === contractIdParam);
				}
				if (!contractToLoad && contractsData.length > 0) {
					contractToLoad = contractsData[0];
				}

				if (contractToLoad) {
					// Passar processData diretamente em vez de usar o state
					await loadEnrichedContract(priCod, contractToLoad.imcCod, processData);
				}
			}
		} catch (err: any) {
			console.error('Error loading process:', err);
			setError(err.message || 'Erro ao carregar processo');
		} finally {
			setLoading(false);
		}
	}

	async function loadEnrichedContract(priCod: number, imcCod: number, processData: any) {
		try {
			const enriched = await fetchEnrichedContractData(priCod, imcCod);
			setSelectedContract(enriched);

			// Auto-populate form from contract, passando processData diretamente
			if (enriched && processData) {
				await autoPopulateFromContract(enriched, processData);
			}
		} catch (err: any) {
			console.error('Error loading enriched contract:', err);
			setError('Erro ao carregar dados do contrato');
		}
	}

	async function autoPopulateFromContract(contract: EnrichedContractData, proc: any) {
		// Debug: log dos dados recebidos
		console.log('[DEBUG] Process data:', proc);
		console.log('[DEBUG] Contract data:', contract);

		// Deck 1: Process Information (USAR DADOS DO PROCESSO, NÃO DO CONTRATO)
		// Tentar pegar do objeto normalizado primeiro, depois do raw
		const raw = proc.raw || proc;

		const refExterna = proc.priEspRefcliente || raw.priEspRefcliente || proc.processNumber || '';
		const nomeCliente = proc.dpeNomPessoa || raw.dpeNomPessoa || proc.clientName || '';
		const incoterm = proc.incoterm || raw.incoterm || raw.incEspSigla || '';

		// Moeda e Valores: usar dados do CONTRATO (mesmos campos da planilha/PDF)
		const moedaNegociada = contract.moeEspNome || proc.currency || raw.moeEspNome || 'USD';
		const valorMoedaNegociada = Number(contract.vlrMneg || 0);
		const valorMoedaNacional = Number(contract.vlrTotalNac || 0);

		// Deck 2: Contract Information
		const dataFechamento = contract.imcDtaFechamento
			? new Date(contract.imcDtaFechamento).toISOString().split('T')[0]
			: '';
		const dataFaturamento = contract.dataFaturamento
			? new Date(contract.dataFaturamento).toISOString().split('T')[0]
			: '';

		// Deck 3: Contract Rates
		const taxaFechamento = contract.imcFltTxFec || null;
		const taxaPtaxDI = contract.taxaPtaxDI || null;

		// Fetch BCB data if A Prazo
		let taxaSpotDoDia: number | null = null;
		if (contract.isAPrazo && dataFechamento) {
			try {
				taxaSpotDoDia = await fetchBCBPtaxVenda(dataFechamento);
			} catch (err) {
				console.warn('Failed to fetch Ptax venda from BCB:', err);
			}
		}

		const newFormState = {
			refExterna,
			nomeCliente,
			incoterm,
			moedaNegociada,
			valorMoedaNegociada,
			valorMoedaNacional,
			dataFechamento,
			dataFaturamento,
			prazoEmDias: 0, // User must input
			vencimentoCliente: '',
			taxaFechamento,
			taxaPtaxDI,
			taxaSpotDoDia,
			taxaSpotNegociada: null, // User must input if A Prazo
			taxaFutura: null, // User must input if A Prazo
			cdiAoAno: null,
			encargosCalculados: 0,
		};

		console.log('[DEBUG] Form state populated:', newFormState);
		setFormState(newFormState);
	}

	async function handleFetchCDI() {
		try {
			setLoadingBCBCDI(true);
			const latestCDI = await fetchBCBLatestCDI();
			if (latestCDI) {
				setFormState(prev => ({
					...prev,
					cdiAoAno: latestCDI.annualRate,
					cdiMensal: latestCDI.monthlyRate,
				}));
			} else {
				setError('Erro ao buscar CDI do BCB');
			}
		} catch (err: any) {
			console.error('Error fetching CDI:', err);
			setError('Erro ao buscar CDI do BCB');
		} finally {
			setLoadingBCBCDI(false);
		}
	}

	function handleCalculate() {
		if (!formState.cdiAoAno || formState.prazoEmDias <= 0 || formState.valorMoedaNacional <= 0) {
			setError('Preencha todos os campos obrigatórios: CDI ao Ano, Prazo em Dias e Valor Moeda Nacional');
			return;
		}

		const encargo = calcularEncargos(
			formState.valorMoedaNacional,
			formState.cdiAoAno,
			formState.prazoEmDias,
		);

		// Variação Cambial: calculada quando Ptax DI e Taxa Fechamento estão disponíveis
		let variacaoCambial: number | undefined;
		if (formState.taxaPtaxDI && formState.taxaFechamento && formState.valorMoedaNegociada > 0) {
			variacaoCambial = calcularVariacaoCambial(
				formState.valorMoedaNegociada,
				formState.taxaPtaxDI,
				formState.taxaFechamento,
			);
		}

		setFormState(prev => ({
			...prev,
			encargosCalculados: encargo,
			variacaoCambial,
		}));

		setError(null);
	}

	async function handleSubmit() {
		if (!formState.encargosCalculados || formState.encargosCalculados <= 0) {
			setError('Calcule os encargos antes de enviar');
			return;
		}

		if (!process) {
			setError('Processo não carregado');
			return;
		}

		try {
			setSubmitting(true);
			setError(null);

			// Prepare data for submission
			const dataToSubmit: CalculationResult & { clientName: string } = {
				processId: processId,
				emissionDate: formState.dataFechamento || new Date().toISOString().split('T')[0],
				totalDisburse: formState.valorMoedaNacional,
				totalInterest: formState.encargosCalculados,
				totalCharges: formState.valorMoedaNacional + formState.encargosCalculados,
				payments: [],
				summary: {
					calculationDate: new Date().toISOString(),
					taxaCDI: formState.cdiAoAno || 0,
					taxaConexos: formState.taxaFechamento || 0,
					effectiveRate: 0,
				},
				clientName: formState.nomeCliente,
				movimentos: [],
				...(formState.variacaoCambial !== undefined && {
					despesas: [{ tipo: 'cambial', descricao: 'Variação Cambial', valor: formState.variacaoCambial }],
				}),
			};

			await submitToConexos(processId, dataToSubmit);
			alert('Encargos financeiros enviados ao Conexos com sucesso!');

			// Reload process data to show updated expenses
			await loadProcessData();
		} catch (err: any) {
			console.error('Error submitting to Conexos:', err);
			setError('Erro ao enviar para o Conexos: ' + (err.message || 'Erro desconhecido'));
		} finally {
			setSubmitting(false);
		}
	}

	function handlePrint() {
		window.print();
	}

	if (loading) {
		return (
			<ProtectedRoute>
				<div className="flex items-center justify-center min-h-screen">
					<Spinner className="w-8 h-8" />
					<span className="ml-3">Carregando...</span>
				</div>
			</ProtectedRoute>
		);
	}

	if (!process || !selectedContract) {
		return (
			<ProtectedRoute>
				<div className="p-6 max-w-6xl mx-auto">
					<Alert>
						<AlertDescription>
							Processo ou contrato não encontrado
						</AlertDescription>
					</Alert>
					<Button onClick={() => router.back()} className="mt-4">
						<ArrowLeft className="w-4 h-4 mr-2" />
						Voltar
					</Button>
				</div>
			</ProtectedRoute>
		);
	}

	const isAVista = selectedContract.isAVista;
	const isAPrazo = selectedContract.isAPrazo;

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
							<h1 className="text-2xl font-bold">Cálculo de Encargos</h1>
							<p className="text-gray-600">
								Processo: {formState.refExterna} - {formState.nomeCliente}
							</p>
						</div>
					</div>
				</div>

				{error && (
					<Alert className="mb-6 bg-red-50 border-red-200">
						<AlertDescription className="text-red-800">{error}</AlertDescription>
					</Alert>
				)}

				{/* DECK 1: Informações do Processo */}
				<Card className="mb-6">
					<CardHeader className="bg-gray-50 border-b">
						<CardTitle>Deck 1: Informações do Processo</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<Label className="text-sm text-gray-600">Referência Externa</Label>
								<Input
									value={formState.refExterna}
									disabled
									className="bg-gray-50"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Nome do Cliente</Label>
								<Input
									value={formState.nomeCliente}
									disabled
									className="bg-gray-50"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Incoterm</Label>
								<Input
									value={formState.incoterm}
									disabled
									className="bg-gray-50"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Moeda Negociada</Label>
								<Input
									value={formState.moedaNegociada}
									disabled
									className="bg-gray-50"
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* DECK 2: Informações do Contrato de Câmbio */}
				<Card className="mb-6">
					<CardHeader className="bg-gray-50 border-b">
						<CardTitle>Deck 2: Informações do Contrato de Câmbio</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<Label className="text-sm text-gray-600">Data Fechamento</Label>
								<Input
									type="date"
									value={formState.dataFechamento}
									disabled
									className="bg-gray-50"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Data Faturamento (Invoice/Proforma) *</Label>
								<Input
									type="date"
									value={formState.dataFaturamento}
									onChange={(e) => setFormState(prev => ({
										...prev,
										dataFaturamento: e.target.value
									}))}
									className="border-blue-400"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Prazo (em dias) *</Label>
								<Input
									type="number"
									value={formState.prazoEmDias || ''}
									onChange={(e) => setFormState(prev => ({
										...prev,
										prazoEmDias: parseInt(e.target.value, 10) || 0
									}))}
									className="border-blue-400"
									placeholder="Ex: 30"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Vencimento Cliente (calculado)</Label>
								<Input
									type="date"
									value={formState.vencimentoCliente}
									disabled
									className="bg-green-50"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Vlr. Contrato ({formState.moedaNegociada})</Label>
								<Input
									value={new Intl.NumberFormat('pt-BR', {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2
									}).format(formState.valorMoedaNegociada)}
									disabled
									className="bg-gray-50"
								/>
							</div>
							<div>
								<Label className="text-sm text-gray-600">Vlr. Nacional (BRL)</Label>
								<Input
									value={new Intl.NumberFormat('pt-BR', {
										style: 'currency',
										currency: 'BRL'
									}).format(formState.valorMoedaNacional)}
									disabled
									className="bg-gray-50 font-semibold"
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* DECK 3: Taxas do Contrato - RENDERIZAÇÃO CONDICIONAL */}
				<Card className="mb-6">
					<CardHeader className="bg-gray-50 border-b">
						<CardTitle>Deck 3: Taxas do Contrato</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						{isAVista ? (
							// À VISTA / ANTECIPADO: Mostrar apenas Taxa Fechamento
							<div>
								<Label className="text-sm text-gray-600">Taxa Fechamento</Label>
								<Input
									value={formState.taxaFechamento?.toFixed(4) || '0.0000'}
									disabled
									className="bg-gray-50 font-semibold"
								/>
								<p className="text-sm text-gray-500 mt-2">
									ℹ Contrato à vista ou antecipado. Apenas Taxa Fechamento aplicável.
								</p>
							</div>
						) : (
							// A PRAZO: Mostrar todas as taxas
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label className="text-sm text-gray-600">Taxa Ptax da D.I (Conexos)</Label>
									<Input
										value={formState.taxaPtaxDI?.toFixed(4) || '0.0000'}
										disabled
										className="bg-gray-50"
									/>
									{!formState.taxaPtaxDI && (
										<p className="text-xs text-orange-600 mt-1">
											⚠ Taxa Ptax D.I não disponível
										</p>
									)}
								</div>
								<div>
									<Label className="text-sm text-gray-600">Taxa Spot do dia do fechamento (BCB)</Label>
									<div className="flex gap-2">
										<Input
											value={formState.taxaSpotDoDia?.toFixed(4) || '0.0000'}
											disabled
											className="bg-gray-50"
										/>
										<Button
											variant="outline"
											size="sm"
											onClick={async () => {
												if (formState.dataFechamento) {
													const rate = await fetchBCBPtaxVenda(formState.dataFechamento);
													if (rate) {
														setFormState(prev => ({ ...prev, taxaSpotDoDia: rate }));
													}
												}
											}}
										>
											Atualizar
										</Button>
									</div>
								</div>
								<div>
									<Label className="text-sm text-gray-600">Taxa Spot Negociada *</Label>
									<Input
										type="number"
										step="0.0001"
										value={formState.taxaSpotNegociada || ''}
										onChange={(e) => setFormState(prev => ({
											...prev,
											taxaSpotNegociada: parseFloat(e.target.value) || null
										}))}
										className="border-blue-400"
										placeholder="Ex: 5.5000"
									/>
								</div>
								<div>
									<Label className="text-sm text-gray-600">Taxa Futura *</Label>
									<Input
										type="number"
										step="0.0001"
										value={formState.taxaFutura || ''}
										onChange={(e) => setFormState(prev => ({
											...prev,
											taxaFutura: parseFloat(e.target.value) || null
										}))}
										className="border-blue-400"
										placeholder="Ex: 5.6000"
									/>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Seção de Cálculo de Encargos */}
				<Card className="mb-6">
					<CardHeader className="bg-gray-50 border-b">
						<CardTitle>Cálculo de Encargos</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="grid grid-cols-2 gap-4 mb-4">
							<div>
								<Label className="text-sm text-gray-600">CDI do dia do fechamento (ao ano) *</Label>
								<div className="flex gap-2">
									<Input
										type="number"
										step="0.0001"
										value={formState.cdiAoAno || ''}
										onChange={(e) => setFormState(prev => ({
											...prev,
											cdiAoAno: parseFloat(e.target.value) || null
										}))}
										className="border-blue-400"
										placeholder="Ex: 10.5"
									/>
									<Button
										variant="outline"
										size="sm"
										onClick={handleFetchCDI}
										disabled={loadingBCBCDI}
									>
										{loadingBCBCDI ? <Spinner className="w-4 h-4" /> : 'Buscar CDI'}
									</Button>
								</div>
							</div>
						</div>

						<div className="bg-blue-50 p-4 rounded-lg mb-4">
							<p className="text-sm font-semibold mb-2">Fórmula:</p>
							<p className="text-sm font-mono">
								Encargo = Valor × (CDI mensal ÷ 30 ÷ 100) × Prazo em dias
							</p>
							<p className="text-xs text-gray-600 mt-1">
								CDI ao ano em percentual (ex: 12,65%) — base 360 dias corridos
							</p>
						</div>

						<Button
							onClick={handleCalculate}
							className="w-full mb-4 bg-blue-600 hover:bg-blue-700 text-white"
							size="lg"
							disabled={!formState.cdiAoAno || formState.prazoEmDias <= 0}
						>
							Calcular Encargos
						</Button>

						{formState.encargosCalculados > 0 && (
							<div className="space-y-3">
								<div className="bg-green-50 p-4 rounded-lg">
									<p className="text-sm font-semibold mb-1">Encargos Calculados (CDI):</p>
									<p className="text-2xl font-bold text-green-700">
										{new Intl.NumberFormat('pt-BR', {
											style: 'currency',
											currency: 'BRL'
										}).format(formState.encargosCalculados)}
									</p>
									<div className="mt-2 text-sm text-gray-600">
										<p>CDI Diária (base 30d): {formState.cdiMensal ? (formState.cdiMensal / 30).toFixed(6) : formState.cdiAoAno ? (formState.cdiAoAno / 360).toFixed(6) : '0'}%</p>
										<p>Prazo: {formState.prazoEmDias} dias</p>
										<p>Base: {new Intl.NumberFormat('pt-BR', {
											style: 'currency',
											currency: 'BRL'
										}).format(formState.valorMoedaNacional)}</p>
									</div>
								</div>

								{formState.variacaoCambial !== undefined && (
									<div className={`p-4 rounded-lg ${formState.variacaoCambial > 0 ? 'bg-red-50' : formState.variacaoCambial < 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
										<p className="text-sm font-semibold mb-1">
											Variação Cambial{' '}
											{formState.variacaoCambial > 0
												? '(Perda Cambial)'
												: formState.variacaoCambial < 0
													? '(Ganho Cambial)'
													: '(Sem Variação)'}
											:
										</p>
										<p className={`text-xl font-bold ${formState.variacaoCambial > 0 ? 'text-red-700' : formState.variacaoCambial < 0 ? 'text-green-700' : 'text-gray-600'}`}>
											{new Intl.NumberFormat('pt-BR', {
												style: 'currency',
												currency: 'BRL'
											}).format(formState.variacaoCambial)}
										</p>
										<div className="mt-2 text-xs text-gray-500">
											<p>
												{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formState.valorMoedaNegociada)}{" "}
												× ({formState.taxaPtaxDI?.toFixed(4)} − {formState.taxaFechamento?.toFixed(4)})
											</p>
											<p className="mt-1 italic">Exibido separadamente — não compõe o total de encargos CDI</p>
										</div>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Ações */}
				<div className="flex gap-4">
					<Button
						onClick={handleSubmit}
						disabled={formState.encargosCalculados <= 0 || submitting}
						className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300"
						size="lg"
					>
						{submitting ? <Spinner className="w-4 h-4 mr-2" /> : null}
						Enviar para Conexos
					</Button>
					<Button
						variant="outline"
						onClick={handlePrint}
						size="lg"
					>
						Exportar PDF
					</Button>
				</div>

				{/* Tabela de Despesas Existentes */}
				{process.expenses && process.expenses.length > 0 && (
					<Card className="mt-6">
						<CardHeader>
							<CardTitle>Despesas Atuais no Conexos</CardTitle>
						</CardHeader>
						<CardContent>
							<table className="w-full">
								<thead>
									<tr className="bg-gray-100">
										<th className="p-2 text-left text-sm">Tipo</th>
										<th className="p-2 text-left text-sm">Descrição</th>
										<th className="p-2 text-right text-sm">Valor (BRL)</th>
									</tr>
								</thead>
								<tbody>
									{process.expenses.map((exp: any, i: number) => (
										<tr key={i} className="border-t">
											<td className="p-2 text-sm">{exp.ctpDesNome}</td>
											<td className="p-2 text-sm">{exp.impDesNome}</td>
											<td className="p-2 text-right text-sm font-semibold">
												{new Intl.NumberFormat('pt-BR', {
													style: 'currency',
													currency: 'BRL'
												}).format(exp.pidMnyValormn || 0)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</CardContent>
					</Card>
				)}
			</div>
		</ProtectedRoute>
	);
}
