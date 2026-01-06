"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchProcessesWithContracts, ProcessWithContract, fetchCDI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthErrorAlert } from "@/components/auth-error-alert";
import { ProtectedRoute } from "@/components/protected-route";
import { Search, Filter, FileText, Calendar, DollarSign, ChevronRight, AlertTriangle, TrendingDown } from "lucide-react";

// Helper to map currency names to ISO codes for Intl.NumberFormat
function getCurrencyCode(name: string): string {
	const upperName = (name || "").toUpperCase();
	if (upperName.includes("DOLAR") || upperName.includes("USD")) return "USD";
	if (upperName.includes("EURO") || upperName.includes("EUR")) return "EUR";
	if (upperName.includes("REAL") || upperName.includes("BRL")) return "BRL";
	if (upperName.includes("LIBRA") || upperName.includes("GBP")) return "GBP";
	// Default to USD if unexpected, but avoid breaking the app
	return "USD";
}

export default function Home() {
	type ProcessTableRow = {
		id: string;
		processNumber: string;
		clientName: string;
		priVldImpexpDesc: string;
		createdAt: string;
		contracts: any[];
		totalValue: string;
		hasDelay: boolean;
		totalLostInterest: number;
	};

	const [processes, setProcesses] = useState<ProcessTableRow[]>([]);
	const [calculatedProcessesCount, setCalculatedProcessesCount] = useState<number>(0);
	const [totalLostInterestGlobal, setTotalLostInterestGlobal] = useState<number>(0);
	const [delayedProcessesCount, setDelayedProcessesCount] = useState<number>(0);
	const [cdiList, setCdiList] = useState<any[]>([]);
	const [filteredProcesses, setFilteredProcesses] = useState<ProcessTableRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [authError, setAuthError] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [sortBy, setSortBy] = useState<string>("recent");
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
	const router = useRouter();
	const searchParams = useSearchParams();

	useEffect(() => {
		loadProcesses();

		// Check for auth errors in URL
		const errorParam = searchParams.get('error');
		if (errorParam) {
			setAuthError(decodeURIComponent(errorParam));
			// Clear error from URL after reading it
			const timer = setTimeout(() => {
				router.replace('/');
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [searchParams, router]);

	useEffect(() => {
		filterAndSortProcesses();
	}, [processes, searchTerm, sortBy]);


	// Função de mapping dos dados vindos do backend/Conexos para os campos da tabela
	function mapProcess(raw: ProcessWithContract, currentCdiList: any[]): ProcessTableRow {
		const contracts = raw.contracts || [];
		const total = contracts.reduce((sum, c) => sum + (Number(c.vlrMneg) || 0), 0);

		let hasDelay = false;
		let processLostInterest = 0;

		contracts.forEach(contract => {
			const dueDate = contract.titDtaVencimento ? new Date(contract.titDtaVencimento) : null;
			const paymentDate = contract.borDtaMvto ? new Date(contract.borDtaMvto) : null;
			const valorBRL = Number(contract.vlrTotalNac || 0);

			if (dueDate && paymentDate && paymentDate > dueDate && valorBRL > 0) {
				hasDelay = true;
				const diffTime = Math.abs(paymentDate.getTime() - dueDate.getTime());
				const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

				const latestCdi = currentCdiList?.[0]?.ftxNumFatDiario || 0.045;
				const interest = valorBRL * (latestCdi / 100) * diffDays;
				processLostInterest += interest;
			}
		});

		return {
			id: String(raw.priCod || raw.id),
			processNumber: raw.priEspRefcliente || raw.processNumber || String(raw.priCod || raw.id),
			clientName: raw.dpeNomPessoa || raw.clientName || '—',
			priVldImpexpDesc: raw.incoterm || '—',
			createdAt: (raw as any).priDtaAbertura ? new Date((raw as any).priDtaAbertura).toISOString() : '',
			contracts: contracts,
			totalValue: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(total),
			hasDelay,
			totalLostInterest: processLostInterest,
		};
	}

	async function loadProcesses() {
		try {
			setLoading(true);
			setError(null);

			// Carregar CDI primeiro para os cálculos
			const cdiData = await fetchCDI();
			setCdiList(cdiData);

			const response = await fetchProcessesWithContracts();
			console.log('[page] Processos com contratos:', response);

			// Mapear processos simples para a lista
			const mapped = response.processes.map(p => ({
				id: String(p.priCod || p.id),
				processNumber: p.priEspRefcliente || p.processNumber || String(p.priCod || p.id),
				clientName: p.dpeNomPessoa || p.clientName || '—',
				priVldImpexpDesc: p.incoterm || '—',
				createdAt: (p as any).priDtaAbertura ? new Date((p as any).priDtaAbertura).toISOString() : '',
				contracts: p.contracts || [],
				totalValue: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format((p.contracts || []).reduce((sum: number, c: any) => sum + (Number(c.vlrMneg) || 0), 0)),
				hasDelay: false,
				totalLostInterest: 0,
			}));
			setProcesses(mapped as any);

			// Atualizar estatísticas globais (apenas total processos)
			setTotalLostInterestGlobal(0);
			setDelayedProcessesCount(0);

			// Keep rows collapsed by default as requested
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


		// Filtro de busca
		if (searchTerm) {
			filtered = filtered.filter(
				(p) =>
					p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
					p.processNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
					p.clientName.toLowerCase().includes(searchTerm.toLowerCase())
			);
		}

		// Ordenação
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
		if (newExpanded.has(id)) {
			newExpanded.delete(id);
		} else {
			newExpanded.add(id);
		}
		setExpandedRows(newExpanded);
	};

	const stats = [
		{ label: "Total Processos", value: processes.length, icon: FileText },
		{
			label: "Com Atraso",
			value: delayedProcessesCount,
			icon: AlertTriangle,
			highlighted: delayedProcessesCount > 0,
			severity: 'warning'
		},
		{
			label: "Juros Perdidos",
			value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalLostInterestGlobal),
			icon: TrendingDown,
			highlighted: totalLostInterestGlobal > 0,
			severity: 'danger'
		},
	];

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
				{/* Auth Error Alert */}
				{authError && (
					<AuthErrorAlert
						error={authError}
						onDismiss={() => {
							setAuthError(null);
							router.replace('/');
						}}
					/>
				)}

				<div className="flex justify-between items-end mb-4">
					<div>
						<h2 className="text-2xl font-bold text-gray-800 tracking-tight">Processos de Importação</h2>
						<p className="text-gray-500 text-sm">Gerencie e calcule encargos financeiros por contrato</p>
					</div>

					{/* Stats Cards - Compact Version */}
					<div className="flex gap-3">
						{stats.slice(0, 1).map((stat, idx) => {
							const IconComponent = stat.icon;
							let bgColor = "bg-white border-gray-200 text-gray-900 shadow-sm";
							let iconColor = "text-gray-400";
							let labelColor = "text-gray-500";
							let subLabelColor = "text-gray-500";

							return (
								<div
									key={idx}
									className={`px-4 py-2 rounded-lg border flex items-center gap-3 min-w-[200px] ${bgColor}`}
								>
									<IconComponent size={20} className={iconColor} />
									<div>
										<div className={`text-base font-bold leading-tight ${labelColor}`}>{stat.value}</div>
										<div className={`text-[10px] uppercase font-bold tracking-wider ${subLabelColor}`}>{stat.label}</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Filters - More Compact */}
				<div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
					<div className="flex items-center gap-3">
						{/* Search */}
						<div className="flex-1 relative">
							<Search className="absolute left-3 top-2 text-gray-400" size={16} />
							<Input
								placeholder="Buscar por número ou cliente..."
								className="pl-9 h-9 text-sm"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>


						{/* Sort */}
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

				{/* Processes Table */}
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
								<th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Contratos</th>
							</tr>
						</thead>
						<tbody>
							{filteredProcesses.map((process) => {
								const isExpanded = expandedRows.has(process.id);
								return (
									<React.Fragment key={process.id}>
										<tr
											className={`border-b border-gray-100 hover:bg-blue-50/10 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/20' : ''}`}
											onClick={() => toggleRow(process.id)}
										>
											<td className="px-4 py-3">
												<ChevronRight
													className={`transition-transform duration-300 transform ${isExpanded ? 'rotate-90 text-[#337ab7]' : 'text-gray-300'}`}
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
												<span className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${isExpanded ? 'bg-[#337ab7] text-white' : 'bg-gray-100 text-gray-500'
													}`}>
													{process.contracts.length} {process.contracts.length === 1 ? 'Contr.' : 'Contr.'}
												</span>
											</td>
										</tr>
										{isExpanded && (
											<tr className="bg-gray-50/40 animate-in fade-in duration-300">
												<td colSpan={7} className="px-0 py-0">
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
																		<th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-right tracking-wider w-20">Ação</th>
																	</tr>
																</thead>
																<tbody className="divide-y divide-gray-50">
																	{process.contracts.map((contract: any) => {
																		const paymentStatus = contract.borDtaMvto ? 'Pago' : 'Aberto';
																		return (
																			<tr key={contract.imcCod} className="hover:bg-blue-50/5 transition-colors">
																				<td className="px-3 py-2 text-[11px] font-bold text-gray-500 font-mono">{contract.imcCod}</td>
																				<td className="px-3 py-2">
																					<span className={`px-1.5 py-0 rounded text-[8px] font-bold uppercase border ${paymentStatus === 'Pago'
																						? 'bg-green-50 text-green-600 border-green-100'
																						: 'bg-yellow-50 text-yellow-600 border-yellow-100'
																						}`}>
																						{paymentStatus}
																					</span>
																				</td>
																				<td className="px-3 py-2 text-[11px] text-gray-600">{contract.imcFltTxFec ? Number(contract.imcFltTxFec).toFixed(4) : '—'}</td>
																				<td className="px-3 py-2 text-[11px] text-gray-600 font-medium">{contract.moeEspNome}</td>
																				<td className="px-3 py-2 text-[11px] text-right text-gray-800">
																					{contract.vlrMneg
																						? new Intl.NumberFormat('pt-BR', {
																							style: 'currency',
																							currency: getCurrencyCode(contract.moeEspNome || 'USD')
																						}).format(contract.vlrMneg)
																						: '—'}
																				</td>
																				<td className="px-3 py-2 text-[11px] text-right text-gray-800">
																					{contract.vlrTotalNac
																						? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contract.vlrTotalNac)
																						: '—'}
																				</td>
																				<td className="px-3 py-2 text-right">
																					<Button
																						size="sm"
																						className="h-6 px-2 text-[9px] bg-[#337ab7] hover:bg-blue-700 text-white font-bold rounded shadow-sm w-full"
																						onClick={(e) => {
																							e.stopPropagation();
																							router.push(`/processes/${process.id}?contractId=${contract.imcCod}`);
																						}}
																					>
																						CALCULAR
																					</Button>
																				</td>
																			</tr>
																		);
																	})}
																	{process.contracts.length === 0 && (
																		<tr>
																			<td colSpan={8} className="py-3 text-center text-xs text-gray-400 italic">
																				Nenhum contrato encontrado.
																			</td>
																		</tr>
																	)}
																</tbody>
															</table>
														</div>
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
							{searchTerm
								? "Nenhum processo encontrado com os filtros aplicados"
								: "Nenhum processo carregado"}
						</p>
					</div>
				)}
			</div>
		</ProtectedRoute>
	);
}
