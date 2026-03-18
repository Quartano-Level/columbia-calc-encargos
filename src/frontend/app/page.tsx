"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchProcessesWithContracts, fetchBCBLatestCDI, fetchCalculationsSummary, MonthlySummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthErrorAlert } from "@/components/auth-error-alert";
import { ProtectedRoute } from "@/components/protected-route";
import { KpiCard } from "@/components/kpi-card";
import { Search, FileText, DollarSign, ChevronRight, AlertTriangle, TrendingDown, FileDown, BarChart2, ChevronDown, CheckCircle2 } from "lucide-react";
import { fetchProcessesForExportV2, fetchBCBCDIHistory, fetchValorPermutar, fetchCom299List } from "@/lib/api";
import { exportDelaysXLSXV2, exportDelaysV2PDF } from "@/lib/csv";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";

// Helper to map currency names to ISO codes for Intl.NumberFormat
function getCurrencyCode(name: string): string {
	const upperName = (name || "").toUpperCase();
	if (upperName.includes("DOLAR") || upperName.includes("USD")) return "USD";
	if (upperName.includes("EURO") || upperName.includes("EUR")) return "EUR";
	if (upperName.includes("REAL") || upperName.includes("BRL")) return "BRL";
	if (upperName.includes("LIBRA") || upperName.includes("GBP")) return "GBP";
	return "USD";
}

const formatBRL = (val: number) =>
	new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

function formatMonthLabel(month: string): string {
	const [year, m] = month.split("-");
	const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
	return `${months[parseInt(m, 10) - 1]}/${year.slice(2)}`;
}

function ChartTooltipContent({ active, payload, label }: any) {
	if (!active || !payload?.length) return null;
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
			<p className="text-xs font-bold text-gray-700 mb-1">{label}</p>
			<p className="text-xs text-[#337ab7]">
				Encargos: <span className="font-bold">{formatBRL(payload[0]?.value ?? 0)}</span>
			</p>
			<p className="text-[10px] text-gray-400">{payload[0]?.payload?.count ?? 0} cálculos</p>
		</div>
	);
}

export default function Home() {
	type ProcessTableRow = {
		id: string;
		processNumber: string;
		clientName: string;
		priVldImpexpDesc: string;
		createdAt: string;
		contracts: any[];
		expenses: any[];
		totalValue: string;
		hasDelay: boolean;
		totalLostInterest: number;
	};

	const [processes, setProcesses] = useState<ProcessTableRow[]>([]);
	const [calculatedProcessesCount, setCalculatedProcessesCount] = useState<number>(0);
	const [totalLostInterestGlobal, setTotalLostInterestGlobal] = useState<number>(0);
	const [delayedProcessesCount, setDelayedProcessesCount] = useState<number>(0);
	const [filteredProcesses, setFilteredProcesses] = useState<ProcessTableRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [kpiLoading, setKpiLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [authError, setAuthError] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [sortBy, setSortBy] = useState<string>("recent");

	// KPI extras
	const [cdiAtual, setCdiAtual] = useState<number | null>(null);
	const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
	const [encargosSubmetidos, setEncargosSubmetidos] = useState<number>(0);
	const [encargosSubmetidosTrend, setEncargosSubmetidosTrend] = useState<number | undefined>(undefined);
	const [chartOpen, setChartOpen] = useState(false);

	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
	const [exporting, setExporting] = useState(false);
	const [exportStep, setExportStep] = useState<string>("");
	const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [dataProv, setDataProv] = useState<string>(() => new Date().toISOString().split("T")[0]);
	const router = useRouter();
	const searchParams = useSearchParams();

	useEffect(() => {
		loadProcesses();
		loadKpiExtras();

		const errorParam = searchParams.get("error");
		if (errorParam) {
			setAuthError(decodeURIComponent(errorParam));
			const timer = setTimeout(() => { router.replace("/"); }, 100);
			return () => clearTimeout(timer);
		}
	}, [searchParams, router]);

	useEffect(() => {
		filterAndSortProcesses();
	}, [processes, searchTerm, sortBy]);

	async function loadKpiExtras() {
		setKpiLoading(true);
		try {
			const [cdiData, summary] = await Promise.all([
				fetchBCBLatestCDI(),
				fetchCalculationsSummary(6),
			]);
			if (cdiData) setCdiAtual(cdiData.annualRate);
			setMonthlySummary(summary);

			// Encargos submetidos e tendência
			const currentMonth = new Date().toISOString().substring(0, 7);
			const prevMonth = (() => {
				const d = new Date();
				d.setMonth(d.getMonth() - 1);
				return d.toISOString().substring(0, 7);
			})();
			const thisMo = summary.find((s) => s.month === currentMonth);
			const prevMo = summary.find((s) => s.month === prevMonth);
			setEncargosSubmetidos(thisMo?.submitted ?? 0);
			if (thisMo && prevMo && prevMo.submitted > 0) {
				setEncargosSubmetidosTrend(((thisMo.submitted - prevMo.submitted) / prevMo.submitted) * 100);
			}
		} catch {
			// falha silenciosa nos KPIs extras
		} finally {
			setKpiLoading(false);
		}
	}

	// Busca dados de todas as filiais + CDI histórico (compartilhado por XLSX e PDF)
	const fetchExportDataV2 = async () => {
		const allProcesses: any[] = [];

		for (let filCod = 1; filCod <= 7; filCod++) {
			setExportStep(`Filial ${filCod}/7 — Buscando processos, NFs, títulos e encargos...`);
			setExportProgress({ current: filCod, total: 7 });
			const { processes: exportProcesses } = await fetchProcessesForExportV2(filCod);
			allProcesses.push(...exportProcesses);
		}

		if (allProcesses.length === 0) {
			throw new Error("Nenhum processo com contrato de câmbio encontrado em nenhuma filial.");
		}

		setExportStep("Analisando períodos de exposição...");
		let minDate = "9999-12-31";
		let maxDate = "0000-01-01";
		for (const proc of allProcesses) {
			for (const inv of proc.invoices || []) {
				if (inv.docDtaEmissao) {
					const d = new Date(inv.docDtaEmissao).toISOString().split("T")[0];
					if (d < minDate) minDate = d;
					if (d > maxDate) maxDate = d;
				}
			}
			for (const c of proc.contracts || []) {
				if (c.imcDtaFechamento) {
					const d = new Date(c.imcDtaFechamento).toISOString().split("T")[0];
					if (d < minDate) minDate = d;
					if (d > maxDate) maxDate = d;
				}
			}
		}

		let cdiHistory: Array<{ date: string; dailyRate: number }> = [];
		if (minDate < maxDate) {
			setExportStep(`Buscando CDI histórica do BCB (${minDate} → ${maxDate})...`);
			cdiHistory = await fetchBCBCDIHistory(minDate, maxDate);
		}

		return { processes: allProcesses, cdiHistory };
	};

	const exportToXLSX = async () => {
		try {
			setExporting(true);
			setExportStep("Buscando Valor a Permutar e adiantamentos (com299)...");
			const [valorPermutar, com299List] = await Promise.all([
				fetchValorPermutar(),
				fetchCom299List().catch(() => []),
			]);
			const { processes, cdiHistory } = await fetchExportDataV2();
			setExportStep("Gerando planilha...");
			exportDelaysXLSXV2({ processes, cdiHistory, valorPermutar, com299List });
			setExportStep(`Concluído! ${processes.length} processos exportados.`);
			await new Promise((r) => setTimeout(r, 1200));
		} catch (err: any) {
			setExportStep("");
			alert(`Falha ao exportar planilha.\n\n${err?.message || "Erro desconhecido"}`);
		} finally {
			setExporting(false);
			setExportStep("");
			setExportProgress({ current: 0, total: 0 });
		}
	};

	const exportToPDF = () => {
		setShowDatePicker(true);
	};

	const runPdfExport = async () => {
		setShowDatePicker(false);
		try {
			setExporting(true);
			setExportStep("Buscando Valor a Permutar e adiantamentos (com299)...");
			const [valorPermutar, com299List] = await Promise.all([
				fetchValorPermutar(),
				fetchCom299List().catch(() => []),
			]);
			const { processes, cdiHistory } = await fetchExportDataV2();
			setExportStep("Gerando PDF...");
			const [y, m, d] = dataProv.split("-");
			const dataProvFormatted = `${d}/${m}/${y}`;
			exportDelaysV2PDF({ processes, cdiHistory, dataProv: dataProvFormatted, valorPermutar, com299List });
			setExportStep(`Concluído! ${processes.length} processos exportados.`);
			await new Promise((r) => setTimeout(r, 1200));
		} catch (err: any) {
			setExportStep("");
			alert(`Falha ao exportar PDF.\n\n${err?.message || "Erro desconhecido"}`);
		} finally {
			setExporting(false);
			setExportStep("");
			setExportProgress({ current: 0, total: 0 });
		}
	};

	async function loadProcesses() {
		try {
			setLoading(true);
			setError(null);

			const response = await fetchProcessesWithContracts();

			// Calcular juros perdidos por atrasos a partir dos dados de pagamentos
			const cdiDiario = 0.045; // fallback; idealmente viria do CDI carregado
			let totalLost = 0;
			const delayedPriCods = new Set<number>();

			response.processes.forEach((p: any) => {
				const titles: any[] = p.payments || [];
				titles.forEach((title: any) => {
					const discharges: any[] = title.discharges || [];
					const dueDate = title.titDtaVencimento ? new Date(title.titDtaVencimento) : null;
					if (!dueDate) return;
					discharges.forEach((bxa: any) => {
						const paymentDate = bxa.borDtaMvto
							? new Date(bxa.borDtaMvto)
							: bxa.bxaDtaBaixa
								? new Date(bxa.bxaDtaBaixa)
								: null;
						const valorBRL = Number(bxa.bxaMnyValor || 0);
						if (paymentDate && paymentDate > dueDate && valorBRL > 0) {
							const days = Math.ceil(Math.abs(paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
							totalLost += valorBRL * (cdiDiario / 100) * days;
							delayedPriCods.add(p.priCod);
						}
					});
				});
			});

			setTotalLostInterestGlobal(totalLost);
			setDelayedProcessesCount(delayedPriCods.size);

			const mapped = response.processes.map((p) => ({
				id: String(p.priCod || p.id),
				processNumber: p.priEspRefcliente || p.processNumber || String(p.priCod || p.id),
				clientName: p.dpeNomPessoa || p.clientName || "—",
				priVldImpexpDesc: p.incoterm || "—",
				createdAt: (p as any).priDtaAbertura ? new Date((p as any).priDtaAbertura).toISOString() : "",
				contracts: p.contracts || [],
				expenses: p.expenses || [],
				totalValue: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(
					(p.contracts || []).reduce((sum: number, c: any) => sum + (Number(c.vlrMneg) || 0), 0)
				),
				hasDelay: false,
				totalLostInterest: 0,
			}));
			setProcesses(mapped as any);
			setExpandedRows(new Set());
			setCalculatedProcessesCount(0);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load processes");
		} finally {
			setLoading(false);
		}
	}

	function filterAndSortProcesses() {
		let filtered = [...processes];
		if (searchTerm) {
			filtered = filtered.filter(
				(p) =>
					p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
					p.processNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
					p.clientName.toLowerCase().includes(searchTerm.toLowerCase())
			);
		}
		filtered.sort((a, b) => {
			switch (sortBy) {
				case "recent":
					return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
				case "oldest":
					return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
				default:
					return 0;
			}
		});
		setFilteredProcesses(filtered);
	}

	const toggleRow = (id: string) => {
		const newExpanded = new Set(expandedRows);
		if (newExpanded.has(id)) newExpanded.delete(id);
		else newExpanded.add(id);
		setExpandedRows(newExpanded);
	};

	const chartData = monthlySummary.map((s) => ({
		name: formatMonthLabel(s.month),
		encargos: s.totalEncargos,
		count: s.count,
	}));

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
				<Spinner className="w-8 h-8 text-[#337ab7]" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-8">
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<Button onClick={loadProcesses} className="mt-4 bg-[#337ab7] hover:bg-blue-800">
					Tentar novamente
				</Button>
			</div>
		);
	}

	return (
		<ProtectedRoute>
			<div className="p-6 max-w-[1600px] mx-auto">
				{authError && (
					<AuthErrorAlert
						error={authError}
						onDismiss={() => { setAuthError(null); router.replace("/"); }}
					/>
				)}

				{/* Header */}
				<div className="flex justify-between items-end mb-5">
					<div>
						<h2 className="text-2xl font-bold text-gray-800 tracking-tight">Processos de Importação</h2>
						<p className="text-gray-500 text-sm">Gerencie e calcule encargos financeiros por contrato</p>
					</div>
					<div className="flex items-center gap-3">
						<button
							onClick={exportToPDF}
							disabled={exporting}
							className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-bold text-xs px-3 py-2 rounded transition-colors"
						>
							<FileText size={14} /> {exporting ? "Exportando..." : "Exportar PDF"}
						</button>
						<button
							onClick={exportToXLSX}
							disabled={exporting}
							className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-bold text-xs px-3 py-2 rounded transition-colors"
						>
							<FileDown size={14} /> {exporting ? "Exportando..." : "Exportar Planilha"}
						</button>

						{/* Overlay de progresso da exportação */}
						{exporting && (
							<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
								<div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
									<div className="flex items-center gap-3 mb-4">
										<Spinner className="w-8 h-8 text-[#337ab7]" />
										<span className="font-bold text-gray-800">Exportando planilha</span>
									</div>
									<p className="text-sm text-gray-600 mb-3">{exportStep}</p>
									{exportProgress.total > 0 && (
										<div className="space-y-2">
											<div className="flex justify-between text-xs text-gray-500">
												<span>Processando</span>
												<span>{exportProgress.current} / {exportProgress.total} filiais</span>
											</div>
											<div className="h-2 bg-gray-100 rounded-full overflow-hidden">
												<div
													className="h-full bg-[#337ab7] transition-all duration-300"
													style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
												/>
											</div>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Modal: date picker para Data Prov do PDF */}
				{showDatePicker && (
					<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
						<div className="bg-white rounded-xl shadow-2xl p-6 max-w-xs w-full mx-4">
							<h3 className="font-bold text-gray-800 mb-1">Exportar PDF</h3>
							<p className="text-xs text-gray-500 mb-4">Informe a <strong>Data Prov</strong> para simulação de encargos nos contratos sem Nota Fiscal.</p>
							<label className="block text-xs font-bold text-gray-600 mb-1">Data Prov</label>
							<input
								type="date"
								className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#337ab7]"
								value={dataProv}
								onChange={(e) => setDataProv(e.target.value)}
							/>
							<div className="flex gap-2 justify-end">
								<button
									onClick={() => setShowDatePicker(false)}
									className="px-4 py-2 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
								>
									Cancelar
								</button>
								<button
									onClick={runPdfExport}
									className="px-4 py-2 text-xs font-bold text-white bg-[#337ab7] hover:bg-blue-700 rounded-lg transition-colors"
								>
									Exportar
								</button>
							</div>
						</div>
					</div>
				)}

			{/* KPI Cards */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
					<KpiCard
						label="Encargos Submetidos (mês)"
						value={encargosSubmetidos}
						icon={CheckCircle2}
						loading={kpiLoading}
						variant={encargosSubmetidos > 0 ? "success" : "default"}
						trend={encargosSubmetidosTrend}
						subtitle="Enviados ao Conexos"
					/>
					<KpiCard
						label="Juros Perdidos (Atrasos)"
						value={formatBRL(totalLostInterestGlobal)}
						icon={TrendingDown}
						loading={loading}
						variant={totalLostInterestGlobal > 0 ? "danger" : "default"}
						subtitle="Estimativa CDI linear"
						invertTrend
					/>
					<KpiCard
						label="Processos com Atraso"
						value={delayedProcessesCount}
						icon={AlertTriangle}
						loading={loading}
						variant={delayedProcessesCount > 0 ? "warning" : "default"}
						subtitle={`De ${processes.length} processos`}
						invertTrend
					/>
					<KpiCard
						label="CDI Atual (a.a.)"
						value={cdiAtual != null ? `${cdiAtual.toFixed(2)}%` : "—"}
						icon={DollarSign}
						loading={kpiLoading}
						variant="info"
						subtitle="Fonte: BCB"
					/>
				</div>

				{/* Gráfico de Encargos por Período (colapsável) */}
				<div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
					<button
						onClick={() => setChartOpen((o) => !o)}
						className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
					>
						<div className="flex items-center gap-2">
							<BarChart2 size={16} className="text-[#337ab7]" />
							<span className="text-sm font-bold text-gray-700">Histórico de Encargos Calculados</span>
							{monthlySummary.length > 0 && (
								<span className="text-[10px] text-gray-400 font-medium">
									({monthlySummary.length} {monthlySummary.length === 1 ? "mês" : "meses"})
								</span>
							)}
						</div>
						<ChevronDown
							size={16}
							className={`text-gray-400 transition-transform duration-200 ${chartOpen ? "rotate-180" : ""}`}
						/>
					</button>

					{chartOpen && (
						<div className="px-4 pb-4 border-t border-gray-100">
							{kpiLoading ? (
								<div className="h-48 flex items-center justify-center">
									<Spinner className="w-6 h-6 text-[#337ab7]" />
								</div>
							) : chartData.length === 0 ? (
								<div className="h-48 flex items-center justify-center text-gray-400 text-sm">
									Nenhum cálculo registrado no período
								</div>
							) : (
								<div className="mt-4">
									<ResponsiveContainer width="100%" height={200}>
										<BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
											<CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
											<XAxis
												dataKey="name"
												tick={{ fontSize: 11, fill: "#9ca3af" }}
												axisLine={false}
												tickLine={false}
											/>
											<YAxis
												tickFormatter={(v) =>
													v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
												}
												tick={{ fontSize: 10, fill: "#9ca3af" }}
												axisLine={false}
												tickLine={false}
												width={52}
											/>
											<Tooltip content={<ChartTooltipContent />} />
											<Bar dataKey="encargos" fill="#337ab7" radius={[4, 4, 0, 0]} maxBarSize={48} />
										</BarChart>
									</ResponsiveContainer>
									<p className="text-[10px] text-gray-400 text-center mt-1">
										Total de encargos calculados por mês (últimos {monthlySummary.length} meses)
									</p>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Filtros */}
				<div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex-1 relative">
							<Search className="absolute left-3 top-2 text-gray-400" size={16} />
							<Input
								placeholder="Buscar por número ou cliente..."
								className="pl-9 h-9 text-sm"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-gray-500 text-xs font-bold uppercase tracking-tight">Ordenar:</span>
							<select
								className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-gray-50 h-9 font-medium"
								value={sortBy}
								onChange={(e) => setSortBy(e.target.value)}
							>
								<option value="recent">Mais recente</option>
								<option value="oldest">Mais antigo</option>
							</select>
						</div>
					</div>
				</div>

				{/* Tabela de Processos */}
				<div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
					<table className="w-full">
						<thead>
							<tr className="border-b border-gray-200 bg-gray-50/80">
								<th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest w-8"></th>
								<th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Código</th>
								<th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Referência</th>
								<th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Cliente</th>
								<th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Incoterm</th>
								<th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Valor Total</th>
								<th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Itens</th>
							<th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase w-24"></th>
							</tr>
						</thead>
						<tbody>
							{filteredProcesses.map((process) => {
								const isExpanded = expandedRows.has(process.id);
								return (
									<React.Fragment key={process.id}>
										<tr
											className={`border-b border-gray-100 hover:bg-blue-50/10 transition-colors cursor-pointer ${isExpanded ? "bg-blue-50/20" : ""}`}
											onClick={() => toggleRow(process.id)}
										>
											<td className="px-4 py-3">
												<ChevronRight
													className={`transition-transform duration-300 transform ${isExpanded ? "rotate-90 text-[#337ab7]" : "text-gray-300"}`}
													size={16}
												/>
											</td>
											<td className="px-4 py-3 text-sm font-bold text-gray-800">{process.id}</td>
											<td className="px-4 py-3 text-sm font-medium text-gray-700">{process.processNumber}</td>
											<td className="px-4 py-3 text-sm text-gray-700">{process.clientName}</td>
											<td className="px-4 py-3">
												<span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{process.priVldImpexpDesc}</span>
												{process.hasDelay && (
													<span className="ml-2 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded animate-pulse">
														ATRASO
													</span>
												)}
											</td>
											<td className="px-4 py-3 text-right text-sm text-gray-900 border-l border-gray-50/50">
												{process.totalValue}
											</td>
											<td className="px-4 py-3 text-right">
												<div className="flex items-center justify-end gap-1.5">
													<span className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${isExpanded ? "bg-[#337ab7] text-white" : "bg-gray-100 text-gray-500"}`}>
														{process.contracts.length} Contr.
													</span>
													{process.expenses.length > 0 && (
														<span className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${isExpanded ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-500"}`}>
															{process.expenses.length} Desp.
														</span>
													)}
												</div>
											</td>
											<td className="px-4 py-3 text-right">
												<Button
													size="sm"
													className="h-7 px-3 text-[10px] bg-[#337ab7] hover:bg-blue-700 text-white font-bold rounded shadow-sm"
													onClick={(e) => {
														e.stopPropagation();
														router.push(`/processes/${process.id}`);
													}}
												>
													CALCULAR
												</Button>
											</td>
										</tr>
										{isExpanded && (
											<tr className="bg-gray-50/40 animate-in fade-in duration-300">
												<td colSpan={8} className="px-0 py-0">
													<div className="px-4 pb-4 pt-1 ml-12 mr-4 border-l-2 border-blue-200/50">
														<div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
															<table className="w-full">
																<thead>
																	<tr className="bg-gray-50/80 border-b border-gray-100">
																		<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">ID Contr.</th>
																		<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">Status</th>
																		<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">Taxa</th>
																		<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">Moeda</th>
																		<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-right tracking-wider">Vlr. Negociado</th>
																		<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-right tracking-wider">Vlr. Nacional</th>
																	</tr>
																</thead>
																<tbody className="divide-y divide-gray-50">
																	{process.contracts.map((contract: any) => {
																		const paymentStatus = contract.borDtaMvto ? "Pago" : "Aberto";
																		return (
																			<tr key={contract.imcCod} className="hover:bg-blue-50/5 transition-colors">
																				<td className="px-3 py-2 text-[11px] font-bold text-gray-500 font-mono">{contract.imcCod}</td>
																				<td className="px-3 py-2">
																					<span className={`px-1.5 py-0 rounded text-[8px] font-bold uppercase border ${paymentStatus === "Pago"
																						? "bg-green-50 text-green-600 border-green-100"
																						: "bg-yellow-50 text-yellow-600 border-yellow-100"
																						}`}>
																						{paymentStatus}
																					</span>
																				</td>
																				<td className="px-3 py-2 text-[11px] text-gray-600">{contract.imcFltTxFec ? Number(contract.imcFltTxFec).toFixed(4) : "—"}</td>
																				<td className="px-3 py-2 text-[11px] text-gray-600 font-medium">{contract.moeEspNome}</td>
																				<td className="px-3 py-2 text-[11px] text-right text-gray-800">
																					{contract.vlrMneg
																						? new Intl.NumberFormat("pt-BR", {
																							style: "currency",
																							currency: getCurrencyCode(contract.moeEspNome || "USD"),
																						}).format(contract.vlrMneg)
																						: "—"}
																				</td>
																				<td className="px-3 py-2 text-[11px] text-right text-gray-800">
																					{contract.vlrTotalNac
																						? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(contract.vlrTotalNac)
																						: "—"}
																				</td>
																			</tr>
																		);
																	})}
																	{process.contracts.length === 0 && (
																		<tr>
																			<td colSpan={6} className="py-3 text-center text-xs text-gray-400 italic">
																				Nenhum contrato encontrado.
																			</td>
																		</tr>
																	)}
																</tbody>
															</table>
														</div>

														{/* Despesas do Processo */}
														{process.expenses.length > 0 && (
															<div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mt-3">
																<div className="px-3 py-2 bg-orange-50/50 border-b border-gray-100">
																	<span className="text-[9px] font-black text-orange-400 uppercase tracking-wider">
																		Despesas do Processo
																	</span>
																</div>
																<table className="w-full">
																	<thead>
																		<tr className="bg-gray-50/80 border-b border-gray-100">
																			<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">Conta de Projeto</th>
																			<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">Encargo</th>
																			<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">Situação</th>
																			<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-left tracking-wider">Moeda</th>
																			<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-right tracking-wider">Vlr. Moeda Negociada</th>
																			<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-right tracking-wider">Vlr. Moeda Nacional</th>
																		</tr>
																	</thead>
																	<tbody className="divide-y divide-gray-50">
																		{process.expenses.map((exp: any, i: number) => (
																			<tr key={i} className="hover:bg-orange-50/5 transition-colors">
																				<td className="px-3 py-2 text-[11px] text-gray-600">{exp.ctpDesNome || '—'}</td>
																				<td className="px-3 py-2 text-[11px] text-gray-700 font-medium">{exp.impDesNome || '—'}</td>
																				<td className="px-3 py-2">
																					<span className={`px-1.5 py-0 rounded text-[8px] font-bold uppercase border ${
																						String(exp.pidVldStatus) === '1'
																							? 'bg-green-50 text-green-600 border-green-100'
																							: 'bg-gray-50 text-gray-500 border-gray-100'
																					}`}>
																						{String(exp.pidVldStatus) === '1' ? 'Ativa' : 'Inativa'}
																					</span>
																				</td>
																				<td className="px-3 py-2 text-[11px] text-gray-600">{exp.moeEspNome || '—'}</td>
																				<td className="px-3 py-2 text-[11px] text-right text-gray-800">
																					{exp.pidMnyValorMneg
																						? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(exp.pidMnyValorMneg))
																						: '—'}
																				</td>
																				<td className="px-3 py-2 text-[11px] text-right text-gray-800">
																					{exp.pidMnyValormn
																						? formatBRL(Number(exp.pidMnyValormn))
																						: '—'}
																				</td>
																			</tr>
																		))}
																	</tbody>
																</table>
															</div>
														)}
													</div>
												</td>
											</tr>
										)}
									</React.Fragment>
								);
							})}
						</tbody>
					</table>
				</div>

				{/* Empty State */}
				{filteredProcesses.length === 0 && (
					<div className="bg-white rounded-xl border border-gray-200 p-8 text-center mt-4">
						<p className="text-gray-500 text-sm">
							{searchTerm ? "Nenhum processo encontrado com os filtros aplicados" : "Nenhum processo carregado"}
						</p>
					</div>
				)}
			</div>
		</ProtectedRoute>
	);
}
