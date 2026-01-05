"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Process, Payment, CalculationResult } from "@/lib/types";
import { fetchProcess, fetchCDI, calculateCharges, submitToConecta, fetchContractsByProcess } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ProtectedRoute } from "@/components/protected-route";

// Helper to map currency names to ISO codes for Intl.NumberFormat
function getCurrencyCode(name: string): string {
	const upperName = (name || "").toUpperCase();
	if (upperName.includes("DOLAR") || upperName.includes("USD")) return "USD";
	if (upperName.includes("EURO") || upperName.includes("EUR")) return "EUR";
	if (upperName.includes("REAL") || upperName.includes("BRL")) return "BRL";
	if (upperName.includes("LIBRA") || upperName.includes("GBP")) return "GBP";
	return "USD";
}

// Helper to format rates (CDI, Spot, etc.)
// 5 -> 5,0; 0,0551310000 -> 0,055131
function formatRate(value: number | string | undefined | null): string {
	const num = typeof value === 'string' ? parseFloat(value) : Number(value);
	if (isNaN(num)) return "0,0";

	return new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 10,
	}).format(num);
}

// Helper to format currency for input (1000 -> 1.000,00)
function formatCurrencyInput(value: string | number): string {
	const num = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : Number(value);
	if (isNaN(num)) return "";
	return new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(num);
}

// Helper to parse currency input back to number
function parseCurrencyInput(value: string): number {
	const cleanValue = value.replace(/\./g, "").replace(",", ".");
	return parseFloat(cleanValue) || 0;
}

export default function ProcessCalculatorPage() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const processId = params.id as string;
	const contractIdParam = searchParams.get('contractId');

	const [process, setProcess] = useState<Process | null>(null);
	const [payments, setPayments] = useState<Payment[]>([]);
	const [contracts, setContracts] = useState<any[]>([]);
	const [selectedContract, setSelectedContract] = useState<any | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingContracts, setLoadingContracts] = useState(true);
	const [calculating, setCalculating] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<CalculationResult | null>(null);
	const [parcelsError, setParcelsError] = useState<string | null>(null);

	// Form state - INPUTS MANUAIS (conforme planilha Excel)
	const [prazo, setPrazo] = useState("");
	const [vencCambioOuFornec, setVencCambioOuFornec] = useState("");
	const [vencAlongamento, setVencAlongamento] = useState("");

	// State for manual expense entry
	const [newExpData, setNewExpData] = useState("");
	const [newExpDias, setNewExpDias] = useState("");
	const [newExpValor, setNewExpValor] = useState("");

	// Taxas - BUSCADAS DO CONEXOS (editáveis)
	const [cdiDiario, setCdiDiario] = useState(""); // CDI Diário (anteriormente CDI A.M)
	const [txPtaxDI, setTxPtaxDI] = useState(""); // Tx Ptax D.I (calculado automaticamente)
	const [txSpotCompra, setTxSpotCompra] = useState(""); // Tx Spot - Compra
	const [txFuturaVenc, setTxFuturaVenc] = useState(""); // Tx Futura - Venc (calculado automaticamente)

	useEffect(() => {
		loadProcess();
	}, [processId]);

	// Calcula automaticamente Tx Ptax D.I e Tx Futura - Venc quando CDI ou Tx Spot mudam
	useEffect(() => {
		if (cdiDiario && txSpotCompra) {
			// Fórmula: Tx Ptax D.I = CDI Diário
			const calculatedTxPtaxDI = parseFloat(cdiDiario);
			setTxPtaxDI(calculatedTxPtaxDI.toFixed(10));

			// Fórmula: Tx Futura - Venc = Tx Spot - Compra + CDI Diário
			const calculatedTxFuturaVenc = parseFloat(txSpotCompra) + parseFloat(cdiDiario);
			setTxFuturaVenc(calculatedTxFuturaVenc.toFixed(10));
		}
	}, [cdiDiario, txSpotCompra]);

	// Preenche automaticamente as datas de vencimento e busca CDI quando um contrato é selecionado
	useEffect(() => {
		// PREENCHIMENTO AUTOMÁTICO REMOVIDO: O próprio usuário insira as datas e taxa spot
		/*
		if (selectedContract.imcDtaFechamento) {
			try {
				startDate = new Date(selectedContract.imcDtaFechamento).toISOString().split('T')[0];
				setVencCambioOuFornec(startDate);
			} catch (e) {
				console.warn('Failed to parse imcDtaFechamento', selectedContract.imcDtaFechamento);
			}
		}
		if (selectedContract.imcDtaLiquidacao) {
			try {
				endDate = new Date(selectedContract.imcDtaLiquidacao).toISOString().split('T')[0];
				setVencAlongamento(endDate);
			} catch (e) {
				console.warn('Failed to parse imcDtaLiquidacao', selectedContract.imcDtaLiquidacao);
			}
		}

		// Preencher a taxa do contrato (Tx Spot - Compra) conforme solicitado pelo usuário
		if (selectedContract.imcFltTxFec) {
			setTxSpotCompra(String(selectedContract.imcFltTxFec));
		}
		*/

		// Buscar CDI baseado no intervalo do contrato se as datas estiverem preenchidas
		if (vencCambioOuFornec && vencAlongamento) {
			fetchCDI(vencCambioOuFornec, vencAlongamento)
				.then((cdiRows) => {
					if (Array.isArray(cdiRows) && cdiRows.length > 0) {
						const first = cdiRows[0];
						// Usar ftxNumFatDiario conforme solicitado (CDI Diário)
						const value = first.ftxNumFatDiario ?? first.ftxNumFatMes ?? first.ftxNumFatAno ?? 0;
						setCdiDiario(Number(value).toFixed(10));
					}
				})
				.catch((err) => {
					console.warn('Failed to fetch CDI range', err);
				});
		}
	}, [selectedContract, vencCambioOuFornec, vencAlongamento]);

	// GERAÇÃO AUTOMÁTICA DE MOVIMENTO: Cria uma linha de despesa quando as datas e taxa spot são preenchidas
	useEffect(() => {
		if (vencCambioOuFornec && vencAlongamento && txSpotCompra && process) {
			const start = new Date(vencCambioOuFornec);
			const end = new Date(vencAlongamento);

			if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
				// Priorizar o valor inserido em 'prazo' se for um número, senão calcular das datas
				const parsedPrazo = parseInt(prazo, 10);
				const diffDays = !isNaN(parsedPrazo) ? parsedPrazo : Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

				// Valor base: Valor do contrato ou do processo
				const valueUSD = selectedContract?.vlrMneg || process.mercadoriasValue || 0;

				const autoMovement: Payment = {
					id: "auto-hedge",
					type: "cambio",
					description: "Câmbio",
					value: valueUSD,
					paymentDate: vencCambioOuFornec,
					dueDate: vencAlongamento,
					days: diffDays,
				};

				setPayments(prev => {
					const manualExpenses = prev.filter(p => p.id !== "auto-hedge");
					return [autoMovement, ...manualExpenses];
				});
			}
		}
	}, [vencCambioOuFornec, vencAlongamento, txSpotCompra, process, selectedContract, prazo]);

	// Cálculo local de encargos para exibição em tempo real
	const calculateChargesLocally = (value: number, days: number) => {
		const cdi = parseFloat(cdiDiario) || 0;
		return value * (cdi / 100) * (days || 0);
	};

	function handleAddExpense() {
		if (!newExpData || !newExpDias || !newExpValor) {
			alert("Por favor, preencha Data, Dias e Valor para a despesa.");
			return;
		}

		const numericValue = parseCurrencyInput(newExpValor);
		const numericDias = parseInt(newExpDias, 10);

		const expense: Payment = {
			id: `exp-${Date.now()}`,
			description: "Despesas",
			value: numericValue,
			paymentDate: newExpData,
			dueDate: newExpData,
			days: numericDias,
			calculatedInterest: calculateChargesLocally(numericValue, numericDias)
		};

		setPayments(prev => [...prev, expense]);
		setNewExpData("");
		setNewExpDias("");
		setNewExpValor("");
	}

	function handleRemovePayment(id: string) {
		setPayments(prev => prev.filter(p => p.id !== id));
	}

	async function loadProcess() {
		try {
			setLoading(true);
			setError(null);
			const data = await fetchProcess(processId);
			setProcess(data.process);
			setPayments(data.payments || []);
			setParcelsError((data as any).parcelsError || null);



			// Buscar contratos relacionados ao processo específico
			try {
				setLoadingContracts(true);
				const priCod = data.process?.priCod || parseInt(processId, 10);
				if (priCod && !isNaN(priCod)) {
					const contractsData = await fetchContractsByProcess(priCod);
					setContracts(contractsData || []);
					if (contractsData && contractsData.length > 0) {
						// Se temos um contractId na URL, tentamos selecionar ele
						if (contractIdParam) {
							const found = contractsData.find(c => String(c.imcCod) === contractIdParam);
							if (found) {
								setSelectedContract(found);
							} else {
								setSelectedContract(contractsData[0]);
							}
						} else {
							setSelectedContract(contractsData[0]);
						}
					}
				} else {
					setContracts([]);
				}
			} catch (err) {
				console.warn('Failed to fetch contracts for process', processId, err);
				setContracts([]);
			} finally {
				setLoadingContracts(false);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load process");
		} finally {
			setLoading(false);
		}
	}


	async function handleCalculate() {
		if (!process) return;

		if (!vencCambioOuFornec || !cdiDiario || !txSpotCompra) {
			setError(`Por favor, preencha todos os campos obrigatórios: ${!vencCambioOuFornec ? "Venc. Cambio ou Fornec. " : ""}${!cdiDiario ? "CDI Diário " : ""}${!txSpotCompra ? "Tx Spot - Compra" : ""}`);
			return;
		}

		try {
			setCalculating(true);
			setError(null);

			// Map new field names to backend expected names
			const input = {
				processId: process.id,
				// Backend expects these field names:
				emissionDate: vencCambioOuFornec || new Date().toISOString().split('T')[0],
				taxaCDI: parseFloat(cdiDiario || "0"),
				taxaConecta: parseFloat(txSpotCompra || "0"),
				// Additional fields for context
				prazo,
				vencimentoCambio: vencCambioOuFornec,
				vencimentoAlongamento: vencAlongamento,
				txPtaxDI: parseFloat(txPtaxDI || "0"),
				txFuturaVenc: parseFloat(txFuturaVenc || "0"),
				payments,
			};

			let calculationResult: any = await calculateCharges(process.id, input);

			// Mapear resposta do backend se necessário
			// Se a resposta veio com estrutura diferente, normalizar para CalculationResult
			console.log("Calculation result received:", calculationResult);

			// Verificar se precisa fazer mapeamento (se não tiver a estrutura esperada)
			if (!calculationResult.totalDisburse && !calculationResult.summary) {
				// Backend retornou estrutura diferente, fazer mapeamento
				const totalDisburse = calculationResult.custos?.custoTotalImportacao ?? calculationResult.summary?.totalDesembolso ?? 0;
				const totalInterest = calculationResult.encargos?.encargosFinanciamento ?? 0;
				const totalCharges = (calculationResult.encargos?.total ?? 0) || totalDisburse;

				const mappedResult: CalculationResult = {
					processId: calculationResult.processId || process.id,
					emissionDate: calculationResult.emissionDate || input.emissionDate,
					totalDisburse: Number(totalDisburse) || 0,
					totalInterest: Number(totalInterest) || 0,
					totalCharges: Number(totalCharges) || 0,
					payments: calculationResult.movimentos?.map((m: any) => ({
						id: `${m.data}-${m.historico}`,
						type: "cambio" as const,
						description: m.historico,
						value: Number(m.valorUSD) || 0,
						paymentDate: m.data,
						dueDate: m.data,
						days: Number(m.diasCorridos) || 0,
						interestRate: Number(m.txSpot) ? (Number(m.txSpot) / 100) : 0,
						calculatedInterest: Number(m.encargos) || 0,
					})) || [],
					summary: {
						calculationDate: calculationResult.summary?.calculadoEm || new Date().toISOString(),
						taxaCDI: parseFloat(cdiDiario || "0") || 0,
						taxaConecta: parseFloat(txSpotCompra || "0") || 0,
						effectiveRate: (parseFloat(cdiDiario || "0") || 0) / 100,
					},
				};
				console.log("Mapped result:", mappedResult);
				calculationResult = mappedResult;
			} else {
				// Validar que todos os valores estão corretos
				const validatedResult: CalculationResult = {
					...calculationResult,
					totalDisburse: Number(calculationResult.totalDisburse) || 0,
					totalInterest: Number(calculationResult.totalInterest) || 0,
					totalCharges: Number(calculationResult.totalCharges) || 0,
					payments: (calculationResult.payments || []).map((p: any) => ({
						...p,
						value: Number(p.value) || 0,
						calculatedInterest: Number(p.calculatedInterest) || 0,
					})),
				};
				calculationResult = validatedResult;
			}

			setResult(calculationResult);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to calculate");
		} finally {
			setCalculating(false);
		}
	}

	async function handleSubmit() {
		if (!result || !process) return;

		try {
			setSubmitting(true);
			setError(null);

			await submitToConecta(process.id, {
				...result,
				clientName: process.clientName,
			});

			alert("Cálculo enviado ao Conexos com sucesso!");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to submit");
		} finally {
			setSubmitting(false);
		}
	}

	function formatCurrency(value: number | undefined | null) {
		// Tratar valores inválidos
		const numValue = Number(value) || 0;
		if (!isFinite(numValue)) {
			return "R$ 0,00";
		}
		return new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: "BRL",
		}).format(numValue);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString("pt-BR");
	}

	function generatePDF() {
		if (!result || !process) return;

		// Criar conteúdo HTML para o PDF
		const pdfContent = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<title>Encargos Financeiros - ${process.processNumber}</title>
	<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
	<style>
		@page {
			size: A4;
			margin: 20mm;
		}
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		body {
			font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
			font-size: 10pt;
			color: #000;
		}
		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
			border-bottom: 2px solid #000;
			padding-bottom: 10px;
		}
		.logo {
			font-size: 24pt;
			font-weight: bold;
			color: #E85D04;
		}
		.logo-subtitle {
			font-size: 10pt;
			color: #E85D04;
		}
		.title {
			font-size: 18pt;
			font-weight: bold;
			text-align: center;
		}
		.process-info {
			margin: 20px 0;
			font-weight: bold;
		}
		.info-section {
			margin: 15px 0;
			background-color: #f5f5f5;
			padding: 10px;
			border-radius: 4px;
		}
		.info-row {
			display: flex;
			justify-content: space-between;
			margin: 5px 0;
		}
		.info-label {
			font-weight: bold;
			min-width: 120px;
		}
		.section-title {
			font-weight: bold;
			font-size: 11pt;
			margin: 15px 0 10px 0;
			padding: 5px;
			background-color: #f0f0f0;
			border-left: 4px solid #E85D04;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			margin: 10px 0;
			font-size: 9pt;
		}
		th {
			background-color: #333;
			color: white;
			padding: 8px 5px;
			text-align: left;
			font-weight: bold;
		}
		td {
			padding: 6px 5px;
			border: 1px solid #ddd;
		}
		tr:nth-child(even) {
			background-color: #f9f9f9;
		}
		.text-right {
			text-align: right;
		}
		.text-center {
			text-align: center;
		}
		.total-row {
			background-color: #f0f0f0 !important;
			font-weight: bold;
		}
		.footer {
			margin-top: 30px;
			text-align: center;
			font-size: 8pt;
			color: #666;
		}
		.cdi-box {
			background-color: #f5f5f5;
			padding: 10px;
			margin: 10px 0;
			text-align: right;
			font-weight: bold;
			border: 1px solid #ddd;
		}
		.summary-grid {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 10px;
			margin: 15px 0;
		}
		.summary-card {
			background-color: #f9f9f9;
			border: 1px solid #ddd;
			padding: 10px;
			text-align: center;
		}
		.summary-label {
			font-size: 8pt;
			color: #666;
			margin-bottom: 5px;
		}
		.summary-value {
			font-size: 14pt;
			font-weight: bold;
			color: #000;
		}
	</style>
</head>
<body>
	<div class="header">
		<div>
			<div class="logo">COLUMBIA</div>
			<div class="logo-subtitle">trading</div>
		</div>
		<div class="title">Encargos Financeiros</div>
	</div>

	<div class="process-info">
		Nro Processo: ${process.processNumber}
	</div>

	<div class="info-section">
		<div class="info-row">
			<span><span class="info-label">CDI Diário:</span> ${formatRate(result.summary.taxaCDI)}%</span>
		</div>
		<div class="info-row">
			<span><span class="info-label">Juros:</span> ${result.summary.effectiveRate ? formatRate(result.summary.effectiveRate * 100) : '0,0'}%</span>
		</div>
	</div>

	<div class="section-title">Custo Hedge/Câmbio</div>
	
	<table>
		<thead>
			<tr>
				<th>Vlr. Negociado</th>
				<th>Vlr. Nacional</th>
				<th class="text-center">Data Hedge/Cambio</th>
				<th class="text-center">Data Venc. Cambio</th>
				<th class="text-center">Prazo</th>
				<th class="text-right">Taxa DI</th>
				<th class="text-right">Taxa Contrato</th>
				<th class="text-right">Custo Hedge</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td class="text-right">${selectedContract?.vlrMneg ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: getCurrencyCode(selectedContract.moeEspNome || 'USD') }).format(selectedContract.vlrMneg) : '-'}</td>
				<td class="text-right">${selectedContract?.vlrTotalNac ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedContract.vlrTotalNac) : '-'}</td>
				<td class="text-center">${vencCambioOuFornec ? formatDate(vencCambioOuFornec) : '-'}</td>
				<td class="text-center">${vencCambioOuFornec ? formatDate(vencCambioOuFornec) : '-'}</td>
				<td class="text-center">${prazo || '0'}</td>
				<td class="text-right">${formatRate(txPtaxDI)}</td>
				<td class="text-right">${formatRate(txSpotCompra)}</td>
				<td class="text-right">${formatCurrency(result.totalDisburse)}</td>
			</tr>
		</tbody>
	</table>

	<div class="section-title">Encargos</div>
	
	<table>
		<thead>
			<tr>
				<th>Descrição</th>
				<th class="text-center">Data de Desembolso</th>
				<th class="text-center">Data de Vencimento</th>
				<th class="text-center">Dias</th>
				<th class="text-center">Taxa de Juros Efetiva</th>
				<th class="text-right">Valor Despesa</th>
				<th class="text-right">Encargos</th>
			</tr>
		</thead>
		<tbody>
			${result.payments?.map(payment => `
				<tr>
					<td>${payment.description}</td>
					<td class="text-center">${formatDate(payment.paymentDate)}</td>
					<td class="text-center">${formatDate(payment.dueDate)}</td>
					<td class="text-center">${payment.days}</td>
					<td class="text-center">${formatRate(payment.interestRate! * 100)}</td>
					<td class="text-right">${formatCurrency(payment.value)}</td>
					<td class="text-right">${formatCurrency(payment.calculatedInterest!)}</td>
				</tr>
			`).join('')}
		</tbody>
		<tfoot>
			<tr class="total-row">
				<td colspan="5" class="text-right"><strong></strong></td>
				<td class="text-right"><strong>${formatCurrency(result.totalDisburse)}</strong></td>
				<td class="text-right"><strong>${formatCurrency(result.totalInterest)}</strong></td>
			</tr>
			<tr>
				<td colspan="6" class="text-right"><strong>IOF Total:</strong></td>
				<td class="text-right"><strong>0,00 BRL</strong></td>
			</tr>
		</tfoot>
	</table>

	<div class="cdi-box">
		CDI Diário: ${formatRate(result.summary.taxaCDI)}%
	</div>

	<div class="footer">
		<p>Documento gerado automaticamente em ${new Date().toLocaleString('pt-BR')}</p>
		<p>Columbia Trading S/A - Sistema de Cálculo de Encargos Financeiros</p>
	</div>
</body>
</html>
		`;

		// Abrir nova janela e imprimir
		const printWindow = window.open('', '_blank');
		if (printWindow) {
			printWindow.document.write(pdfContent);
			printWindow.document.close();

			// Aguardar carregamento e imprimir
			printWindow.onload = () => {
				setTimeout(() => {
					printWindow.print();
				}, 250);
			};
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[calc(100vh-5rem)] p-6">
				<Spinner className="w-8 h-8 text-[#337ab7]" />
			</div>
		);
	}

	if (error && !process) {
		return (
			<div className="p-6 max-w-6xl mx-auto">
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<Button onClick={() => router.push("/")} className="mt-4 bg-[#337ab7] hover:bg-blue-800">
					Voltar para Processos
				</Button>
			</div>
		);
	}

	if (!process) return null;

	return (
		<ProtectedRoute>
			<div className="p-6 max-w-6xl mx-auto">
				<div className="mb-6">
					<Button variant="ghost" onClick={() => router.push("/")} className="hover:bg-gray-100">
						← Voltar
					</Button>
				</div>

				{/* Alerta de ausência de contratos */}
				{!loadingContracts && contracts.length === 0 && (
					<Alert variant="destructive" className="mb-6">
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
						<AlertDescription className="ml-2">
							<strong>Atenção:</strong> Não há contratos de câmbio vinculados a este processo.
						</AlertDescription>
					</Alert>
				)}

				{/* SEÇÃO 1: CABEÇALHO - Dados do Processo (conforme planilha Excel) */}
				<Card className="mb-6 shadow-sm">
					<CardHeader className="bg-gray-50 border-b">
						<div className="flex items-center gap-2">
							<svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
							<CardTitle className="text-lg font-semibold text-gray-900">Informações do Processo</CardTitle>
						</div>
						<CardDescription className="text-gray-600">
							Columbia Trading S/A - CÁLCULO DE ENCARGOS FINANCEIROS
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
							{/* Linha 1 */}
							<div className="space-y-2">
								<Label className="text-sm font-medium text-gray-700">Cliente</Label>
								<Input
									value={process.dpeNomPessoa}
									disabled
									className="bg-gray-50 border-gray-200"
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-sm font-medium text-gray-700">Processo</Label>
								<Input
									value={process.priEspRefcliente}
									disabled
									className="bg-gray-50 border-gray-200"
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-sm font-medium text-gray-700">Incoterm</Label>
								<Input
									value={process.incoterm}
									disabled
									className="bg-gray-50 border-gray-200"
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-sm font-medium text-gray-700">Valor Moeda Negociada</Label>
								<Input
									value={selectedContract?.vlrMneg ? new Intl.NumberFormat('pt-BR', {
										style: 'currency',
										currency: getCurrencyCode(selectedContract.moeEspNome || 'USD')
									}).format(selectedContract.vlrMneg) : formatCurrency(process.mercadoriasValue)}
									disabled
									className="bg-gray-50 border-gray-200"
								/>
							</div>

							{/* Linha 2 - Campos de Input */}
							<div className="space-y-2">
								<Label htmlFor="prazo" className="text-sm font-medium text-gray-700">
									Prazo
								</Label>
								<Input
									id="prazo"
									type="text"
									value={prazo}
									onChange={(e) => setPrazo(e.target.value)}
									placeholder="Ex: 90 dias"
									className="border-gray-300 focus:border-gray-400"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="vencCambioOuFornec" className="text-sm font-medium text-gray-700">
									Venc. Cambio ou Fornec.
								</Label>
								<Input
									id="vencCambioOuFornec"
									type="date"
									value={vencCambioOuFornec}
									onChange={(e) => setVencCambioOuFornec(e.target.value)}
									className="border-gray-300 focus:border-gray-400"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="vencAlongamento" className="text-sm font-medium text-gray-700">
									Venc. Alongamento
								</Label>
								<Input
									id="vencAlongamento"
									type="date"
									value={vencAlongamento}
									onChange={(e) => setVencAlongamento(e.target.value)}
									className="border-gray-300 focus:border-gray-400"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="cdiDiario" className="text-sm font-medium text-gray-700">
									CDI Diário (%)
								</Label>
								<Input
									id="cdiDiario"
									type="number"
									step="0.0000000001"
									value={cdiDiario}
									onChange={(e) => setCdiDiario(e.target.value)}
									className="border-gray-300 focus:border-gray-400"
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* SEÇÃO 2: TAXAS E PARÂMETROS (conforme colunas da planilha) */}
				<Card className="mb-6 shadow-sm">
					<CardHeader className="bg-gray-50 border-b">
						<div className="flex items-center gap-2">
							<svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
							</svg>
							<CardTitle className="text-lg font-semibold text-gray-900">Taxas de Câmbio</CardTitle>
						</div>
						<CardDescription className="text-gray-600">
							Configure as taxas para o cálculo dos encargos financeiros
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="space-y-2">
								<Label htmlFor="txPtaxDI" className="text-sm font-medium text-gray-700">
									Tx Ptax D.I (%)
								</Label>
								<Input
									id="txPtaxDI"
									type="number"
									step="0.0001"
									value={txPtaxDI}
									onChange={(e) => setTxPtaxDI(e.target.value)}
									placeholder="Calculado automaticamente"
									className="bg-gray-50 border-gray-200 text-gray-600"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="txSpotCompra" className="text-sm font-medium text-gray-700">
									Tx Spot - Compra (%)
								</Label>
								<Input
									id="txSpotCompra"
									type="number"
									step="0.0001"
									value={txSpotCompra}
									onChange={(e) => setTxSpotCompra(e.target.value)}
									placeholder="0,0"
									className="border-gray-300 focus:border-gray-400"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="txFuturaVenc" className="text-sm font-medium text-gray-700">
									Tx Futura - Venc (%)
								</Label>
								<Input
									id="txFuturaVenc"
									type="number"
									step="0.0001"
									value={txFuturaVenc}
									readOnly
									placeholder="Calculado automaticamente"
									className="bg-gray-50 border-gray-200 text-gray-600"
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* SEÇÃO 3: TABELA DE MOVIMENTOS (conforme estrutura da planilha Excel) */}
				<Card className="mb-6 shadow-sm">
					<CardHeader className="bg-gray-50 border-b">
						<div className="flex items-center gap-2">
							<svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
							</svg>
							<CardTitle className="text-lg font-semibold text-gray-900">Data Movimento</CardTitle>
						</div>
						<CardDescription className="text-gray-600">
							Histórico de movimentos financeiros e cálculo de encargos
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						{parcelsError && (
							<Alert variant="destructive" className="mb-4">
								<AlertDescription>Falha ao buscar movimentos do Conexos: {parcelsError}</AlertDescription>
							</Alert>
						)}

						<div className="overflow-x-auto">
							<table className="w-full border-collapse border border-gray-200">
								<thead>
									<tr className="bg-gray-700 text-white">
										<th className="px-3 py-2 text-left text-xs font-medium border border-gray-600">
											Data Movimento
										</th>
										<th className="px-3 py-2 text-left text-xs font-medium border border-gray-600">
											Histórico
										</th>
										<th className="px-3 py-2 text-center text-xs font-medium border border-gray-600">
											Dias
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium border border-gray-600">
											Tx Ptax D.I
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium border border-gray-600">
											Tx Spot - Compra
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium border border-gray-600">
											Tx Futura - Venc
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium border border-gray-600">
											Valor
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium border border-gray-600">
											Encargos
										</th>
										<th className="px-3 py-2 text-right text-xs font-medium border border-gray-600">
											Total
										</th>
										<th className="px-3 py-2 text-center text-xs font-medium border border-gray-600 w-10">
											Ações
										</th>
									</tr>
								</thead>
								<tbody>
									{/* Linha de entrada manual para Despesas */}
									<tr className="bg-blue-50/50">
										<td className="px-2 py-2 border border-blue-100">
											<Input
												type="date"
												value={newExpData}
												onChange={(e) => setNewExpData(e.target.value)}
												className="h-8 text-xs border-blue-200 focus:border-blue-300"
											/>
										</td>
										<td className="px-2 py-2 border border-blue-100 italic text-xs text-blue-600">
											Despesas (Automático)
										</td>
										<td className="px-2 py-2 border border-blue-100">
											<Input
												type="number"
												placeholder="Dias"
												value={newExpDias}
												onChange={(e) => setNewExpDias(e.target.value)}
												className="h-8 text-xs border-blue-200 focus:border-blue-300 text-center"
											/>
										</td>
										<td className="px-2 py-2 border border-blue-100 text-center text-xs text-gray-400">
											-
										</td>
										<td className="px-2 py-2 border border-blue-100 text-center text-xs text-gray-400">
											-
										</td>
										<td className="px-2 py-2 border border-blue-100 text-center text-xs text-gray-400">
											-
										</td>
										<td className="px-2 py-2 border border-blue-100">
											<Input
												type="text"
												placeholder="Valor USD"
												value={newExpValor}
												onChange={(e) => setNewExpValor(e.target.value)}
												onBlur={(e) => {
													const formatted = formatCurrencyInput(e.target.value);
													if (formatted) setNewExpValor(formatted);
												}}
												className="h-8 text-xs border-blue-200 focus:border-blue-300"
											/>
										</td>
										<td className="px-2 py-2 border border-blue-100 text-right text-xs text-blue-700 font-medium">
											{newExpValor && newExpDias ? formatCurrency(calculateChargesLocally(parseCurrencyInput(newExpValor), parseInt(newExpDias, 10))) : "-"}
										</td>
										<td className="px-2 py-2 border border-blue-100 text-right text-xs text-blue-900 font-bold">
											{newExpValor && newExpDias
												? formatCurrency(parseCurrencyInput(newExpValor) + calculateChargesLocally(parseCurrencyInput(newExpValor), parseInt(newExpDias, 10)))
												: "-"}
										</td>
										<td className="px-2 py-2 border border-blue-100 text-center">
											<Button
												size="sm"
												onClick={handleAddExpense}
												className="h-8 bg-[#337ab7] hover:bg-blue-800 text-xs px-2"
											>
												Adicionar
											</Button>
										</td>
									</tr>

									{payments.length > 0 ? (
										payments.map((payment, index) => (
											<tr
												key={payment.id}
												className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
											>
												<td className="px-3 py-2 border border-gray-200 text-xs">
													{new Date(payment.paymentDate).toLocaleDateString("pt-BR")}
												</td>
												<td className="px-3 py-2 border border-gray-200">
													<div className="flex flex-col gap-1">
														<span className="text-sm font-medium text-gray-900">{payment.description}</span>
													</div>
												</td>
												<td className="px-3 py-2 border border-gray-200 text-center text-xs">
													<div className="flex items-center justify-center gap-1">
														<span className="font-semibold text-gray-900">{payment.days}</span>
														<span className="text-[10px] text-gray-400 italic">dias</span>
													</div>
												</td>
												<td className="px-3 py-2 border border-gray-200 text-right text-xs">
													{txPtaxDI ? formatRate(txPtaxDI) : "-"}
												</td>
												<td className="px-3 py-2 border border-gray-200 text-right text-xs">
													{txSpotCompra ? formatRate(txSpotCompra) : "-"}
												</td>
												<td className="px-3 py-2 border border-gray-200 text-right text-xs">
													{txFuturaVenc ? formatRate(txFuturaVenc) : "-"}
												</td>
												<td className="px-3 py-2 border border-gray-200 text-right text-xs">
													{formatCurrency(payment.value)}
												</td>
												<td className="px-3 py-2 border border-gray-200 text-right text-xs text-blue-700 font-medium">
													{formatCurrency(payment.calculatedInterest || calculateChargesLocally(payment.value, payment.days || 0))}
												</td>
												<td className="px-3 py-2 border border-gray-200 text-right text-xs text-gray-900 font-bold">
													{formatCurrency(payment.value + (payment.calculatedInterest || calculateChargesLocally(payment.value, payment.days || 0)))}
												</td>
												<td className="px-3 py-2 border border-gray-200 text-center">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleRemovePayment(payment.id)}
														className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
													>
														<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
														</svg>
													</Button>
												</td>
											</tr>
										))
									) : (
										<tr>
											<td colSpan={10} className="px-4 py-8 text-center text-gray-500 border border-gray-200">
												<div className="flex flex-col items-center gap-2">
													<svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
													</svg>
													<p className="text-sm font-medium">Nenhum movimento cadastrado</p>
													<p className="text-xs text-gray-400">Adicione pagamentos para calcular os encargos</p>
												</div>
											</td>
										</tr>
									)}
								</tbody>
								{payments.length > 0 && (
									<tfoot>
										<tr className="bg-gray-100 border-t-2 border-gray-300">
											<td colSpan={6} className="px-3 py-2 text-right font-semibold text-gray-900 text-sm border border-gray-200">
												TOTAIS:
											</td>
											<td className="px-3 py-2 text-right font-medium text-gray-900 text-sm border border-gray-200">
												{formatCurrency(payments.reduce((sum, p) => sum + p.value, 0))}
											</td>
											<td className="px-3 py-2 text-right font-medium text-gray-900 text-sm border border-gray-200">
												{formatCurrency(
													payments.reduce((sum, p) => sum + (p.calculatedInterest || calculateChargesLocally(p.value, p.days || 0)), 0)
												)}
											</td>
											<td className="px-3 py-2 text-right font-medium text-gray-900 text-sm border border-gray-200">
												{formatCurrency(
													payments.reduce((sum, p) => sum + p.value + (p.calculatedInterest || calculateChargesLocally(p.value, p.days || 0)), 0)
												)}
											</td>
											<td className="px-3 py-2 border border-gray-200 bg-gray-50"></td>
										</tr>
									</tfoot>
								)}
							</table>
						</div>

						{/* CDI Display (conforme planilha) */}
						<div className="mt-6 flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
							<div className="flex items-center gap-2">
								<svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
								</svg>
								<span className="text-sm font-semibold text-gray-700">CDI Diário:</span>
							</div>
							<span className="text-xl font-bold text-gray-900">{formatRate(cdiDiario)}%</span>
						</div>

						<Button
							onClick={handleCalculate}
							disabled={calculating || payments.length === 0}
							className="w-full mt-6 bg-[#337ab7] hover:bg-blue-800 h-12"
							size="lg"
						>
							{calculating ? (
								<>
									<Spinner className="w-5 h-5 mr-2" />
									Calculando...
								</>
							) : (
								"Calcular Encargos Financeiros"
							)}
						</Button>
					</CardContent>
				</Card>

				{/* Error Alert */}
				{error && (
					<Alert variant="destructive" className="mb-6">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{/* SEÇÃO 4: RESULTADOS DO CÁLCULO */}
				{result && (
					<Card className="shadow-sm">
						<CardHeader className="bg-gray-50 border-b">
							<div className="flex items-center gap-2">
								<svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<CardTitle className="text-lg font-semibold text-gray-900">
									Resultado do Cálculo de Encargos Financeiros
								</CardTitle>
							</div>
							<CardDescription className="text-gray-600">
								Calculado em {result?.summary?.calculationDate ? new Date(result.summary.calculationDate).toLocaleString("pt-BR") : "—"}
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-6">
							{/* RESUMO PRINCIPAL */}
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
								<Card className="shadow-sm">
									<CardHeader className="pb-2">
										<CardDescription className="text-gray-600 text-xs">Total Desembolsos</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-2xl font-bold text-gray-900">
											{formatCurrency(result.totalDisburse)}
										</p>
									</CardContent>
								</Card>

								<Card className="shadow-sm">
									<CardHeader className="pb-2">
										<CardDescription className="text-gray-600 text-xs">Total Juros</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-2xl font-bold text-gray-900">
											{formatCurrency(result.totalInterest)}
										</p>
									</CardContent>
								</Card>

								<Card className="shadow-sm">
									<CardHeader className="pb-2">
										<CardDescription className="text-gray-600 text-xs">Total Encargos</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-2xl font-bold text-gray-900">
											{formatCurrency(result.totalCharges)}
										</p>
									</CardContent>
								</Card>
							</div>

							<Separator className="my-6" />

							{/* PARÂMETROS UTILIZADOS */}
							<div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
								<h3 className="text-sm font-semibold mb-3 text-gray-900">
									Parâmetros Utilizados
								</h3>
								<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
									<div>
										<p className="text-xs text-gray-600 mb-1">CDI Diário</p>
										<p className="font-semibold text-sm text-gray-900">{formatRate(result.summary.taxaCDI)}%</p>
									</div>
									<div>
										<p className="text-xs text-gray-600 mb-1">Tx Spot - Compra</p>
										<p className="font-semibold text-sm text-gray-900">{formatRate(result.summary.taxaConecta)}%</p>
									</div>
									<div>
										<p className="text-xs text-gray-600 mb-1">Taxa Efetiva</p>
										<p className="font-semibold text-sm text-gray-900">
											{result.summary.effectiveRate ? formatRate(result.summary.effectiveRate * 100) : '0,0'}%
										</p>
									</div>
									<div>
										<p className="text-xs text-gray-600 mb-1">Prazo</p>
										<p className="font-semibold text-sm text-gray-900">
											{prazo || "-"}
										</p>
									</div>
								</div>
							</div>

							{/* DETALHAMENTO POR PAGAMENTO */}
							<div className="mb-6">
								<h3 className="text-sm font-semibold mb-3 text-gray-900">
									Detalhamento por Movimento
								</h3>
								<div className="border border-gray-200 rounded-lg overflow-hidden">
									<table className="w-full">
										<thead className="bg-gray-700 text-white">
											<tr>
												<th className="text-left px-3 py-2 text-xs font-medium">Histórico</th>
												<th className="text-right px-3 py-2 text-xs font-medium">Valor</th>
												<th className="text-center px-3 py-2 text-xs font-medium">Dias</th>
												<th className="text-center px-3 py-2 text-xs font-medium">Taxa</th>
												<th className="text-right px-3 py-2 text-xs font-medium">Encargos</th>
												<th className="text-right px-3 py-2 text-xs font-medium">Total</th>
											</tr>
										</thead>
										<tbody>
											{result.payments?.map((payment, index) => (
												<tr
													key={payment.id}
													className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
												>
													<td className="px-3 py-2 border-t border-gray-200">
														<p className="text-sm font-medium text-gray-900">{payment.description}</p>
														<Badge variant="outline" className="mt-1 text-xs">
															{payment.type}
														</Badge>
													</td>
													<td className="px-3 py-2 border-t border-gray-200 text-right font-semibold text-sm">
														{formatCurrency(payment.value)}
													</td>
													<td className="px-3 py-2 border-t border-gray-200 text-center">
														<span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">
															{payment.days} dias
														</span>
													</td>
													<td className="px-3 py-2 border-t border-gray-200 text-center text-xs">
														{formatRate(payment.interestRate! * 100)}%
													</td>
													<td className="px-3 py-2 border-t border-gray-200 text-right font-semibold text-sm text-gray-900">
														{formatCurrency(payment.calculatedInterest!)}
													</td>
													<td className="px-3 py-2 border-t border-gray-200 text-right font-semibold text-sm text-gray-900">
														{formatCurrency(payment.value + payment.calculatedInterest!)}
													</td>
												</tr>
											))}
										</tbody>
										<tfoot className="bg-gray-100 border-t-2 border-gray-300">
											<tr>
												<td className="px-3 py-3 text-right font-bold text-sm text-gray-900" colSpan={4}>
													TOTAIS A COBRAR:
												</td>
												<td className="px-3 py-3 text-right font-bold text-base text-gray-900">
													{formatCurrency(result.totalInterest)}
												</td>
												<td className="px-3 py-3 text-right font-bold text-base text-gray-900">
													{formatCurrency(result.totalCharges)}
												</td>
											</tr>
										</tfoot>
									</table>
								</div>
							</div>

							{/* AÇÕES */}
							<div className="flex gap-3">
								<Button
									onClick={handleSubmit}
									disabled={submitting}
									className="flex-1 bg-[#337ab7] hover:bg-blue-800 h-11"
									size="lg"
								>
									{submitting ? (
										<>
											<Spinner className="w-4 h-4 mr-2" />
											Enviando...
										</>
									) : (
										"Enviar para o Conexos"
									)}
								</Button>
								<Button
									variant="outline"
									size="lg"
									onClick={generatePDF}
									className="h-11"
								>
									Exportar PDF
								</Button>
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</ProtectedRoute>
	);
}
