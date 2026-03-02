"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { fetchProcessesWithContracts, fetchCDI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, TrendingDown, Clock, CheckCircle2, Info, X, FileDown, ChevronDown, ChevronRight, Calendar, Search, SortAsc } from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { formatRate } from "@/lib/utils";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";

interface DelayDocument {
	priCod: number;
	processRef: string;
	clientName: string;
	docNumber: string;
	docCod: number;
	dueDate: string;
	paymentDate: string;
	delayDays: number;
	lostInterest: number;
	valorBRL: number;
}

interface GroupedProcess {
	priCod: number;
	processRef: string;
	clientName: string;
	totalLostInterest: number;
	maxDelayDays: number;
	maxDueDate: string;
	documents: DelayDocument[];
}

type SortOrder = "maior-juros" | "maior-atraso" | "mais-recente";

const formatCurrency = (val: number) =>
	new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

const formatDateSafe = (dateStr: string | null | undefined) => {
	if (!dateStr) return "—";
	const d = new Date(dateStr);
	const adjusted = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
	return adjusted.toLocaleDateString("pt-BR");
};

const toYMD = (d: Date) => d.toISOString().split("T")[0];

export default function DelaysAnalysisPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [loading, setLoading] = useState(true);
	const [allDocuments, setAllDocuments] = useState<DelayDocument[]>([]);
	const [allGrouped, setAllGrouped] = useState<GroupedProcess[]>([]);
	const [expandedProcesses, setExpandedProcesses] = useState<Set<number>>(new Set());
	const [selectedDoc, setSelectedDoc] = useState<DelayDocument | null>(null);
	const [cdiRate, setCdiRate] = useState<number>(0);

	// Filtros
	const [clientFilter, setClientFilter] = useState(() => searchParams.get("client") ?? "");
	const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
		const from = searchParams.get("from");
		const to = searchParams.get("to");
		if (!from && !to) return undefined;
		return {
			from: from ? new Date(from) : undefined,
			to: to ? new Date(to) : undefined,
		};
	});
	const [sortOrder, setSortOrder] = useState<SortOrder>(
		(searchParams.get("sort") as SortOrder) ?? "maior-juros"
	);
	const [calendarOpen, setCalendarOpen] = useState(false);

	// Sync filtros → URL
	useEffect(() => {
		const params = new URLSearchParams();
		if (clientFilter) params.set("client", clientFilter);
		if (dateRange?.from) params.set("from", toYMD(dateRange.from));
		if (dateRange?.to) params.set("to", toYMD(dateRange.to));
		if (sortOrder !== "maior-juros") params.set("sort", sortOrder);
		const qs = params.toString();
		router.replace(qs ? `/analysis/delays?${qs}` : "/analysis/delays", { scroll: false });
	}, [clientFilter, dateRange, sortOrder]);

	useEffect(() => {
		loadData();
	}, []);

	async function loadData() {
		try {
			setLoading(true);
			const cdiData = await fetchCDI();
			const response = await fetchProcessesWithContracts();

			const cdiDiario = cdiData?.[0]?.ftxNumFatDiario || 0.045;
			setCdiRate(cdiDiario);

			const lateDocuments: DelayDocument[] = [];

			response.processes.forEach((p: any) => {
				const titles = p.payments || [];
				titles.forEach((title: any) => {
					const discharges = title.discharges || [];
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
							const interest = valorBRL * (cdiDiario / 100) * days;

							lateDocuments.push({
								priCod: p.priCod,
								processRef: p.priEspRefcliente || p.processNumber || String(p.priCod),
								clientName: p.dpeNomPessoa || p.clientName || "—",
								docNumber: title.titEspNumero || title.docEspNumero || String(title.titCod),
								docCod: title.docCod,
								dueDate: title.titDtaVencimento,
								paymentDate: bxa.borDtaMvto || bxa.bxaDtaBaixa,
								delayDays: days,
								lostInterest: interest,
								valorBRL,
							});
						}
					});
				});
			});

			setAllDocuments(lateDocuments);
			setAllGrouped(buildGrouped(lateDocuments));
		} catch (err) {
			console.error("Error loading analysis data:", err);
		} finally {
			setLoading(false);
		}
	}

	function buildGrouped(docs: DelayDocument[]): GroupedProcess[] {
		const map = new Map<number, GroupedProcess>();
		for (const doc of docs) {
			if (!map.has(doc.priCod)) {
				map.set(doc.priCod, {
					priCod: doc.priCod,
					processRef: doc.processRef,
					clientName: doc.clientName,
					totalLostInterest: 0,
					maxDelayDays: 0,
					maxDueDate: "",
					documents: [],
				});
			}
			const g = map.get(doc.priCod)!;
			g.documents.push(doc);
			g.totalLostInterest += doc.lostInterest;
			if (doc.delayDays > g.maxDelayDays) g.maxDelayDays = doc.delayDays;
			if (!g.maxDueDate || doc.dueDate > g.maxDueDate) g.maxDueDate = doc.dueDate;
		}
		return Array.from(map.values());
	}

	// Filtro e ordenação aplicados
	const filteredGrouped: GroupedProcess[] = React.useMemo(() => {
		let groups = allGrouped.map((g) => {
			// Filtrar documentos do grupo pelo período
			let docs = g.documents;
			if (dateRange?.from || dateRange?.to) {
				docs = docs.filter((d) => {
					if (!d.dueDate) return false;
					// Normaliza dueDate (YYYY-MM-DD ou Date string)
					const due = new Date(d.dueDate);
					const dueNorm = new Date(due.getTime() + due.getTimezoneOffset() * 60000);
					if (dateRange.from && dueNorm < dateRange.from) return false;
					if (dateRange.to) {
						const toEnd = new Date(dateRange.to);
						toEnd.setHours(23, 59, 59, 999);
						if (dueNorm > toEnd) return false;
					}
					return true;
				});
			}
			if (docs.length === 0) return null;

			// Recompute totais com documentos filtrados
			const totalLostInterest = docs.reduce((s, d) => s + d.lostInterest, 0);
			const maxDelayDays = Math.max(...docs.map((d) => d.delayDays));
			const maxDueDate = docs.reduce((m, d) => (d.dueDate > m ? d.dueDate : m), "");

			return { ...g, documents: docs, totalLostInterest, maxDelayDays, maxDueDate };
		}).filter(Boolean) as GroupedProcess[];

		// Filtro por cliente
		if (clientFilter.trim()) {
			const q = clientFilter.trim().toLowerCase();
			groups = groups.filter(
				(g) =>
					g.clientName.toLowerCase().includes(q) ||
					g.processRef.toLowerCase().includes(q)
			);
		}

		// Ordenação
		switch (sortOrder) {
			case "maior-juros":
				groups.sort((a, b) => b.totalLostInterest - a.totalLostInterest);
				break;
			case "maior-atraso":
				groups.sort((a, b) => b.maxDelayDays - a.maxDelayDays);
				break;
			case "mais-recente":
				groups.sort((a, b) => (b.maxDueDate > a.maxDueDate ? 1 : -1));
				break;
		}

		return groups;
	}, [allGrouped, clientFilter, dateRange, sortOrder]);

	// Estatísticas calculadas a partir dos filtros aplicados
	const stats = React.useMemo(() => {
		const filteredDocs = filteredGrouped.flatMap((g) => g.documents);
		const totalLostInterest = filteredDocs.reduce((s, d) => s + d.lostInterest, 0);
		const delayedCount = filteredDocs.length;
		const totalDaysDelay = filteredDocs.reduce((s, d) => s + d.delayDays, 0);
		const processCount = allDocuments.length > 0 ? new Set(allDocuments.map((d) => d.priCod)).size : 0;
		const filteredProcessCount = filteredGrouped.length;
		return {
			totalLostInterest,
			delayedCount,
			averageDelay: delayedCount > 0 ? totalDaysDelay / delayedCount : 0,
			efficiencyRate: processCount > 0
				? ((allGrouped.length > 0 ? (allGrouped.length - filteredGrouped.length) : 0) / (allGrouped.length || 1)) * 100
				: 100,
			filteredProcessCount,
		};
	}, [filteredGrouped, allDocuments, allGrouped]);

	const toggleProcess = (priCod: number) => {
		setExpandedProcesses((prev) => {
			const s = new Set(prev);
			s.has(priCod) ? s.delete(priCod) : s.add(priCod);
			return s;
		});
	};

	const clearDateRange = () => setDateRange(undefined);

	const dateRangeLabel = (() => {
		if (!dateRange?.from && !dateRange?.to) return "Qualquer período";
		const from = dateRange.from ? dateRange.from.toLocaleDateString("pt-BR") : "...";
		const to = dateRange.to ? dateRange.to.toLocaleDateString("pt-BR") : "...";
		return dateRange.from && dateRange.to ? `${from} — ${to}` : from;
	})();

	const exportToPDF = () => {
		const printWindow = window.open("", "_blank");
		if (!printWindow) { alert("Por favor, permita pop-ups para exportar o PDF."); return; }

		const allFilteredDocs = filteredGrouped.flatMap((g) => g.documents);

		const htmlContent = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório de Atrasos - ${new Date().toLocaleDateString("pt-BR")}</title>
<style>
body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
h1 { font-size: 24px; margin-bottom: 5px; }
.subtitle { color: #666; margin-bottom: 20px; }
.stats { display: flex; gap: 20px; margin-bottom: 30px; }
.stat-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; min-width: 150px; }
.stat-label { font-size: 10px; color: #666; text-transform: uppercase; font-weight: bold; }
.stat-value { font-size: 24px; font-weight: bold; margin-top: 5px; }
.stat-value.red { color: #dc2626; }
table { width: 100%; border-collapse: collapse; margin-top: 20px; }
th { background: #f5f5f5; padding: 12px 8px; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #ddd; }
td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
.text-right { text-align: right; } .text-center { text-align: center; }
.red { color: #dc2626; font-weight: bold; }
.footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #999; }
@media print { body { padding: 0; } }
</style></head><body>
<h1>Relatório de Atrasos e Perdas Financeiras</h1>
<p class="subtitle">Gerado em ${new Date().toLocaleString("pt-BR")} | CDI Diário: ${cdiRate}% | ${dateRangeLabel !== "Qualquer período" ? `Período: ${dateRangeLabel}` : "Todos os períodos"}</p>
<div class="stats">
<div class="stat-card"><div class="stat-label">Total Juros Perdidos</div><div class="stat-value red">${formatCurrency(stats.totalLostInterest)}</div></div>
<div class="stat-card"><div class="stat-label">Documentos com Atraso</div><div class="stat-value">${stats.delayedCount}</div></div>
<div class="stat-card"><div class="stat-label">Média de Atraso</div><div class="stat-value">${stats.averageDelay.toFixed(1)} dias</div></div>
</div>
<table><thead><tr>
<th>Processo</th><th>Documento</th><th class="text-center">Vencimento</th>
<th class="text-center">Baixa</th><th class="text-center">Atraso</th>
<th class="text-right">Valor Base</th><th class="text-right">Perda Estimada</th>
</tr></thead><tbody>
${allFilteredDocs.map((p) => `<tr>
<td><strong>${p.priCod}</strong><br><small>${p.processRef}</small></td>
<td>${p.docNumber}<br><small>${p.clientName}</small></td>
<td class="text-center">${formatDateSafe(p.dueDate)}</td>
<td class="text-center">${formatDateSafe(p.paymentDate)}</td>
<td class="text-center">${p.delayDays} dias</td>
<td class="text-right">${formatCurrency(p.valorBRL)}</td>
<td class="text-right red">${formatCurrency(p.lostInterest)}</td>
</tr>`).join("")}
</tbody></table>
<div class="footer"><p>* Estimativa simplificada baseada no CDI diário médio (${cdiRate}%).</p>
<p>Fórmula: Juros = Valor Base × (CDI Diário / 100) × Dias de Atraso</p></div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`;

		printWindow.document.write(htmlContent);
		printWindow.document.close();
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
				<Spinner className="w-8 h-8 text-[#337ab7]" />
			</div>
		);
	}

	return (
		<ProtectedRoute>
			<div className="p-6 max-w-[1400px] mx-auto">
				<div className="mb-6">
					<h2 className="text-3xl font-bold text-gray-900 tracking-tight">Análise de Atrasos e Eficiência</h2>
					<p className="text-gray-500 mt-1">Visão consolidada de perdas financeiras por descasamento de datas</p>
				</div>

				{/* Dashboard Cards */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
					<Card className="border-red-100 bg-red-50/30 overflow-hidden relative">
						<div className="absolute top-0 right-0 p-3 opacity-10"><TrendingDown size={60} /></div>
						<CardHeader className="pb-2">
							<CardDescription className="text-red-600 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
								<TrendingDown size={14} /> Total Juros Perdidos
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-black text-red-700">{formatCurrency(stats.totalLostInterest)}</div>
							<p className="text-[10px] text-gray-500 mt-1 font-medium">* Estimativa baseada no CDI diário dos períodos de atraso.</p>
						</CardContent>
					</Card>

					<Card className="border-gray-200 bg-white overflow-hidden relative">
						<div className="absolute top-0 right-0 p-3 opacity-10"><AlertTriangle size={60} /></div>
						<CardHeader className="pb-2">
							<CardDescription className="text-gray-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
								<AlertTriangle size={14} /> Documentos com Atraso
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-black text-gray-900">{stats.delayedCount}</div>
							<p className="text-[10px] text-gray-500 mt-1 font-medium">
								{stats.filteredProcessCount} processos{filteredGrouped.length !== allGrouped.length ? " (filtrado)" : " analisados"}.
							</p>
						</CardContent>
					</Card>

					<Card className="border-gray-200 bg-white overflow-hidden relative">
						<div className="absolute top-0 right-0 p-3 opacity-10"><CheckCircle2 size={60} /></div>
						<CardHeader className="pb-2">
							<CardDescription className="text-gray-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
								<CheckCircle2 size={14} /> Processos sem Atraso
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-black text-gray-900">
								{Math.max(0, allGrouped.length - filteredGrouped.length)}
							</div>
							<div className="w-full bg-gray-100 h-2 rounded-full mt-2 overflow-hidden shadow-inner">
								<div
									className="bg-blue-600 h-full transition-all duration-1000 ease-out"
									style={{
										width: `${allGrouped.length > 0 ? ((allGrouped.length - filteredGrouped.length) / allGrouped.length) * 100 : 100}%`
									}}
								/>
							</div>
						</CardContent>
					</Card>

					<Card className="border-gray-200 bg-white overflow-hidden relative">
						<div className="absolute top-0 right-0 p-3 opacity-10"><Clock size={60} /></div>
						<CardHeader className="pb-2">
							<CardDescription className="text-gray-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
								<Clock size={14} /> Média de Atraso
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-black text-gray-900">
								{stats.averageDelay.toFixed(1)} <span className="text-sm font-normal text-gray-400">dias</span>
							</div>
							<p className="text-[10px] text-gray-500 mt-1 font-medium">Considerando apenas parcelas em atraso.</p>
						</CardContent>
					</Card>
				</div>

				{/* Tabela de Processos Críticos */}
				<div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
					<div className="p-4 border-b border-gray-100 bg-gray-50/50">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
							<h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
								<AlertTriangle size={20} className="text-red-500" />
								Ranking de Processos Críticos
							</h3>
							<div className="flex items-center gap-2">
								<button
									onClick={exportToPDF}
									className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs px-3 py-2 rounded transition-colors"
								>
									<FileDown size={14} /> Exportar PDF
								</button>
								<Badge variant="outline" className="font-black text-xs px-3 py-1 bg-white shadow-sm border-red-100 text-red-700">
									{stats.delayedCount} DOCS EM ATRASO
								</Badge>
							</div>
						</div>

						{/* Filtros */}
						<div className="flex flex-wrap items-center gap-2 mt-3">
							{/* Filtro cliente */}
							<div className="relative flex-1 min-w-[180px] max-w-[280px]">
								<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
								<Input
									value={clientFilter}
									onChange={(e) => setClientFilter(e.target.value)}
									placeholder="Filtrar por cliente..."
									className="pl-8 h-8 text-xs"
								/>
								{clientFilter && (
									<button
										onClick={() => setClientFilter("")}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
									>
										<X size={12} />
									</button>
								)}
							</div>

							{/* Filtro período com DayPicker */}
							<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
								<PopoverTrigger asChild>
									<button className={`flex items-center gap-1.5 border rounded-lg px-3 h-8 text-xs font-medium transition-colors ${dateRange?.from ? "border-[#337ab7] bg-blue-50 text-[#337ab7]" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
										<Calendar size={13} />
										<span>{dateRangeLabel}</span>
										{dateRange?.from && (
											<span
												className="ml-1 text-gray-400 hover:text-gray-600"
												onClick={(e) => { e.stopPropagation(); clearDateRange(); }}
											>
												<X size={11} />
											</span>
										)}
									</button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0" align="start">
									<DayPicker
										mode="range"
										selected={dateRange}
										onSelect={(range) => {
											setDateRange(range);
											if (range?.from && range?.to) setCalendarOpen(false);
										}}
										captionLayout="dropdown"
										locale={undefined}
									/>
									{dateRange?.from && (
										<div className="border-t p-2 flex justify-end">
											<button
												onClick={clearDateRange}
												className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
											>
												Limpar período
											</button>
										</div>
									)}
								</PopoverContent>
							</Popover>

							{/* Ordenação */}
							<div className="flex items-center gap-1.5">
								<SortAsc size={14} className="text-gray-400" />
								<select
									value={sortOrder}
									onChange={(e) => setSortOrder(e.target.value as SortOrder)}
									className="border border-gray-200 rounded-lg px-2 h-8 text-xs bg-gray-50 font-medium"
								>
									<option value="maior-juros">Maior Juros Perdidos</option>
									<option value="maior-atraso">Maior Atraso em Dias</option>
									<option value="mais-recente">Vencimento Mais Recente</option>
								</select>
							</div>

							{/* Indicador de filtros ativos */}
							{(clientFilter || dateRange?.from || sortOrder !== "maior-juros") && (
								<button
									onClick={() => {
										setClientFilter("");
										setDateRange(undefined);
										setSortOrder("maior-juros");
									}}
									className="text-[10px] text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1"
								>
									<X size={10} /> Limpar filtros
								</button>
							)}
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="bg-gray-50/80 border-b border-gray-100">
									<th className="px-4 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest w-10"></th>
									<th className="px-4 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Código</th>
									<th className="px-4 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Referência Externa</th>
									<th className="px-4 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Cliente</th>
									<th className="px-4 py-4 text-right text-[11px] font-black text-gray-400 uppercase tracking-widest">
										{sortOrder === "maior-atraso" ? "Maior Atraso" : "Perda Estimada Total"}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100">
								{filteredGrouped.map((proc) => {
									const isExpanded = expandedProcesses.has(proc.priCod);
									return (
										<React.Fragment key={proc.priCod}>
											<tr
												className="hover:bg-gray-50 cursor-pointer transition-colors"
												onClick={() => toggleProcess(proc.priCod)}
											>
												<td className="px-4 py-4">
													{isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
												</td>
												<td className="px-4 py-4">
													<span className="font-bold text-gray-900">{proc.priCod}</span>
												</td>
												<td className="px-4 py-4">
													<span className="text-sm text-gray-700">{proc.processRef}</span>
												</td>
												<td className="px-4 py-4">
													<span className="text-sm text-gray-700">{proc.clientName}</span>
												</td>
												<td className="px-6 py-4 text-right">
													{sortOrder === "maior-atraso" ? (
														<>
															<span className="text-sm font-bold text-amber-600">{proc.maxDelayDays} dias</span>
															<span className="ml-2 text-[10px] text-gray-400">({proc.documents.length} doc{proc.documents.length !== 1 ? "s" : ""})</span>
														</>
													) : (
														<>
															<span className="text-sm font-bold text-red-600">{formatCurrency(proc.totalLostInterest)}</span>
															<span className="ml-2 text-[10px] text-gray-400">({proc.documents.length} doc{proc.documents.length !== 1 ? "s" : ""})</span>
														</>
													)}
												</td>
											</tr>

											{isExpanded && (
												<tr className="bg-gray-50/50">
													<td colSpan={5} className="px-0 py-0">
														<div className="px-6 pb-4 pt-2 ml-8 border-l-2 border-blue-200/50">
															<table className="w-full">
																<thead>
																	<tr className="text-[10px] text-gray-400 uppercase">
																		<th className="px-3 py-2 text-left font-bold">Documento</th>
																		<th className="px-3 py-2 text-center font-bold">Vencimento</th>
																		<th className="px-3 py-2 text-center font-bold">Baixa</th>
																		<th className="px-3 py-2 text-center font-bold">Atraso</th>
																		<th className="px-3 py-2 text-right font-bold">Perda Estimada</th>
																		<th className="px-3 py-2 text-center font-bold w-12"></th>
																	</tr>
																</thead>
																<tbody className="divide-y divide-gray-100">
																	{proc.documents.map((doc, idx) => (
																		<tr key={`${doc.docCod}-${idx}`} className="hover:bg-blue-50/30 transition-colors">
																			<td className="px-3 py-2">
																				<span className="text-sm font-medium text-gray-800">{doc.docNumber}</span>
																			</td>
																			<td className="px-3 py-2 text-center">
																				<span className="text-sm text-gray-700">{formatDateSafe(doc.dueDate)}</span>
																			</td>
																			<td className="px-3 py-2 text-center">
																				<span className="text-sm text-gray-700">{formatDateSafe(doc.paymentDate)}</span>
																			</td>
																			<td className="px-3 py-2 text-center">
																				<span className="text-sm text-gray-700">{doc.delayDays} dias</span>
																			</td>
																			<td className="px-3 py-2 text-right">
																				<div className="text-sm font-bold text-red-600">{formatCurrency(doc.lostInterest)}</div>
																				<div className="text-[10px] text-gray-400">Sobre {formatCurrency(doc.valorBRL)}</div>
																			</td>
																			<td className="px-3 py-2 text-center">
																				<button
																					onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}
																					className="w-7 h-7 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 flex items-center justify-center transition-all mx-auto"
																					title="Ver detalhes do cálculo"
																				>
																					<Info size={14} />
																				</button>
																			</td>
																		</tr>
																	))}
																</tbody>
															</table>
														</div>
													</td>
												</tr>
											)}
										</React.Fragment>
									);
								})}

								{filteredGrouped.length === 0 && (
									<tr>
										<td colSpan={5} className="px-8 py-20 text-center">
											<div className="flex flex-col items-center gap-4">
												<div className="bg-green-50 p-6 rounded-full border border-green-100 shadow-inner">
													<CheckCircle2 size={48} className="text-green-500" />
												</div>
												<div className="space-y-1">
													{clientFilter || dateRange?.from ? (
														<>
															<p className="text-gray-800 font-black text-lg">Nenhum resultado para o filtro aplicado.</p>
															<p className="text-gray-400 text-sm font-medium">Ajuste os filtros para ver outros registros.</p>
														</>
													) : (
														<>
															<p className="text-gray-800 font-black text-lg">Parabéns! Operação 100% eficiente.</p>
															<p className="text-gray-400 text-sm font-medium">Nenhum processo com atraso detectado na base atual.</p>
														</>
													)}
												</div>
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<div className="p-4 bg-gray-50/50 border-t border-gray-100 text-center">
						<p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
							Fim do relatório de atrasos críticos | CDI Diário: {formatRate(cdiRate)}
						</p>
					</div>
				</div>
			</div>

			{/* Modal de Detalhes */}
			{selectedDoc && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
					<div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
						<div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
							<div>
								<h3 className="font-bold text-gray-900 text-lg">Detalhes do Cálculo de Juros</h3>
								<p className="text-sm text-gray-500">Processo {selectedDoc.priCod} - {selectedDoc.docNumber}</p>
							</div>
							<button
								onClick={() => setSelectedDoc(null)}
								className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
							>
								<X size={18} className="text-gray-600" />
							</button>
						</div>
						<div className="p-5 overflow-y-auto max-h-[calc(90vh-200px)]">
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
								<div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
									<p className="text-[10px] text-gray-500 uppercase font-bold">Valor Base</p>
									<p className="text-lg font-black text-gray-900">{formatCurrency(selectedDoc.valorBRL)}</p>
								</div>
								<div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
									<p className="text-[10px] text-gray-500 uppercase font-bold">Dias de Atraso</p>
									<p className="text-lg font-black text-gray-900">{selectedDoc.delayDays} dias</p>
								</div>
								<div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
									<p className="text-[10px] text-gray-500 uppercase font-bold">CDI Diário</p>
									<p className="text-lg font-black text-gray-900">{cdiRate.toFixed(4)}%</p>
								</div>
								<div className="bg-red-50 rounded-lg p-3 border border-red-100">
									<p className="text-[10px] text-red-600 uppercase font-bold">Juros Perdidos</p>
									<p className="text-lg font-black text-red-700">{formatCurrency(selectedDoc.lostInterest)}</p>
								</div>
							</div>
							<div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
								<h4 className="font-bold text-blue-800 text-sm mb-2">Fórmula Utilizada (Simplificada)</h4>
								<code className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded block">
									Juros = Valor Base × (CDI Diário / 100) × Dias de Atraso
								</code>
								<p className="text-xs text-blue-600 mt-2">
									{formatCurrency(selectedDoc.valorBRL)} × ({cdiRate.toFixed(4)} / 100) × {selectedDoc.delayDays} = {formatCurrency(selectedDoc.lostInterest)}
								</p>
							</div>
							<div className="border border-gray-200 rounded-lg overflow-hidden">
								<table className="w-full text-sm">
									<thead className="bg-gray-100">
										<tr>
											<th className="px-4 py-3 text-left font-bold text-gray-600">Descrição</th>
											<th className="px-4 py-3 text-right font-bold text-gray-600">Valor</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-gray-100">
										<tr><td className="px-4 py-3 text-gray-700">Data de Vencimento</td><td className="px-4 py-3 text-right font-bold">{formatDateSafe(selectedDoc.dueDate)}</td></tr>
										<tr><td className="px-4 py-3 text-gray-700">Data da Baixa/Pagamento</td><td className="px-4 py-3 text-right font-bold">{formatDateSafe(selectedDoc.paymentDate)}</td></tr>
										<tr><td className="px-4 py-3 text-gray-700">Dias de Atraso</td><td className="px-4 py-3 text-right font-bold">{selectedDoc.delayDays} dias</td></tr>
										<tr><td className="px-4 py-3 text-gray-700">Taxa CDI Diária Utilizada</td><td className="px-4 py-3 text-right font-bold">{cdiRate.toFixed(4)}%</td></tr>
										<tr><td className="px-4 py-3 text-gray-700">Valor Base (Principal)</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(selectedDoc.valorBRL)}</td></tr>
										<tr className="bg-red-50"><td className="px-4 py-3 text-red-700 font-bold">Total de Juros Perdidos</td><td className="px-4 py-3 text-right font-black text-red-700">{formatCurrency(selectedDoc.lostInterest)}</td></tr>
									</tbody>
								</table>
							</div>
							<p className="text-xs text-gray-400 mt-4 italic">
								* Estimativa simplificada baseada no CDI diário médio. Para cálculo preciso com capitalização composta, utilize a função "Calcular" na página do processo.
							</p>
						</div>
						<div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
							<button onClick={() => setSelectedDoc(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-sm px-4 py-2 rounded transition-colors">
								Fechar
							</button>
						</div>
					</div>
				</div>
			)}
		</ProtectedRoute>
	);
}
