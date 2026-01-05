"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchProcessesWithContracts, ProcessWithContract } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthErrorAlert } from "@/components/auth-error-alert";
import { ProtectedRoute } from "@/components/protected-route";
import { Search, Filter, FileText, Calendar, DollarSign } from "lucide-react";

export default function Home() {
	type ProcessTableRow = {
		id: string;
		processNumber: string;
		clientName: string;
		priVldImpexpDesc: string;
		// Novos campos do contrato
		taxa: string;
		moeda: string;
		valorMoeda: string;
		paymentStatus: string;
		paymentDate: string;
		createdAt: string;
	};

	const [processes, setProcesses] = useState<ProcessTableRow[]>([]);
	const [calculatedProcessesCount, setCalculatedProcessesCount] = useState<number>(0);
	const [filteredProcesses, setFilteredProcesses] = useState<ProcessTableRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [authError, setAuthError] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [sortBy, setSortBy] = useState<string>("recent");
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
	}, [processes, searchTerm, statusFilter, sortBy]);


	// Função de mapping dos dados vindos do backend/Conexos para os campos da tabela
	function mapProcess(raw: ProcessWithContract): ProcessTableRow {
		const paymentInfo = raw.paymentData || (raw as any).paymentInfo;
		return {
			id: String(raw.priCod || raw.id),
			processNumber: raw.priEspRefcliente || raw.processNumber || String(raw.priCod || raw.id),
			clientName: raw.dpeNomPessoa || raw.clientName || '—',
			priVldImpexpDesc: raw.incoterm || '—',
			// Dados do contrato de câmbio
			taxa: raw.contractData?.taxa ? String(raw.contractData.taxa) : '—',
			moeda: raw.contractData?.moeda || '—',
			valorMoeda: raw.contractData?.valorMoeda
				? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(raw.contractData.valorMoeda)
				: '—',
			paymentStatus: paymentInfo?.status || '—',
			paymentDate: paymentInfo?.date
				? new Date(paymentInfo.date).toLocaleDateString('pt-BR')
				: (paymentInfo?.nextDueDate
					? `Venc: ${new Date(paymentInfo.nextDueDate).toLocaleDateString('pt-BR')}`
					: '—'),
			createdAt: (raw as any).priDtaAbertura ? new Date((raw as any).priDtaAbertura).toISOString() : '',
		};
	}

	async function loadProcesses() {
		try {
			setLoading(true);
			setError(null);
			const response = await fetchProcessesWithContracts();
			console.log('[page] Processos com contratos:', response);
			// Faz o mapping dos dados recebidos
			setProcesses(response.processes.map(mapProcess));
			// TODO: Fetch calculations count separately if needed
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

	type ProcessStatus = "pending" | "calculated" | "submitted";

	function getStatusBadge(status: ProcessStatus) {
		const styles: Record<ProcessStatus, string> = {
			pending: "bg-yellow-100 text-yellow-800",
			calculated: "bg-blue-100 text-blue-800",
			submitted: "bg-green-100 text-green-800",
		};

		const labels: Record<ProcessStatus, string> = {
			pending: "Pendente",
			calculated: "Calculado",
			submitted: "Enviado",
		};

		return (
			<span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
				{labels[status]}
			</span>
		);
	}


	// Para este contexto, valor é sempre '—', então não precisa formatar
	function formatCurrency(value: string) {
		return value;
	}

	const stats = [
		{ label: "Total de Processos", value: processes.length, icon: FileText },
		{
			label: "Processos Pendentes",
			value: processes.length,
			icon: Calendar,
			highlighted: true,
		},
		{
			label: "Processos Calculados",
			value: calculatedProcessesCount,
			icon: DollarSign,
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
			<div className="p-8">
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

				<h2 className="text-3xl font-bold text-gray-700 mb-2">Processos de Importação</h2>
				<p className="text-gray-500 mb-8">Selecione um processo para calcular os encargos financeiros</p>

				{/* Stats Cards */}
				<div className="grid grid-cols-3 gap-4 mb-8">
					{stats.map((stat, idx) => {
						const IconComponent = stat.icon;
						return (
							<div
								key={idx}
								className={`p-6 rounded-xl ${stat.highlighted
									? "bg-[#337ab7] text-white"
									: "bg-white text-gray-900 border border-gray-200"
									}`}
							>
								<div className="flex items-center gap-3">
									<IconComponent size={24} className={stat.highlighted ? "text-white" : "text-gray-700"} />
									<div>
										<div className="text-3xl font-bold">{stat.value}</div>
										<div className={stat.highlighted ? "text-blue-100" : "text-gray-600"}>{stat.label}</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>

				{/* Filters */}
				<div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
					<div className="flex items-center gap-4">
						{/* Search */}
						<div className="flex-1 relative">
							<Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
							<Input
								placeholder="Pesquisar por número do processo ou cliente..."
								className="pl-10 h-10"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>


						{/* Sort */}
						<div className="flex items-center gap-2">
							<span className="text-gray-600 text-sm">Ordenar:</span>
							<select
								className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white h-10"
								value={sortBy}
								onChange={(e) => setSortBy(e.target.value)}
							>
								<option value="recent">Mais recente</option>
								<option value="oldest">Mais antigo</option>
								<option value="value-high">Maior valor</option>
								<option value="value-low">Menor valor</option>
							</select>
						</div>
					</div>
				</div>

				{/* Processes Table */}
				<div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
					<table className="w-full">
						<thead>
							<tr className="border-b border-gray-200 bg-gray-50">
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Código</th>
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Referência</th>
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Cliente</th>
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Incoterm</th>
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Dt. Pagto</th>
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Taxa</th>
								<th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Moeda</th>
								<th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Valor Moeda</th>
								<th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Ações</th>
							</tr>
						</thead>
						<tbody>
							{filteredProcesses.map((process) => (
								<tr key={process.id} className="border-b border-gray-200 hover:bg-gray-50">
									<td className="px-6 py-4 text-sm font-medium text-gray-700">{process.id}</td>
									<td className="px-6 py-4 text-sm text-gray-700">{process.processNumber}</td>
									<td className="px-6 py-4 text-sm text-gray-700">{process.clientName}</td>
									<td className="px-6 py-4 text-sm text-gray-700">{process.priVldImpexpDesc}</td>
									<td className="px-6 py-4 text-sm text-gray-700">{process.paymentDate}</td>
									<td className="px-6 py-4">
										<span className={`px-2 py-1 rounded-full text-xs font-medium ${process.paymentStatus === 'Pago' ? 'bg-green-100 text-green-800' :
											process.paymentStatus === 'Aberto' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
											}`}>
											{process.paymentStatus}
										</span>
									</td>
									<td className="px-6 py-4 text-sm text-gray-700">{process.taxa}</td>
									<td className="px-6 py-4 text-sm text-gray-700">{process.moeda}</td>
									<td className="px-6 py-4 text-sm text-right text-gray-700">{process.valorMoeda}</td>
									<td className="px-6 py-4 text-sm text-right">
										<Button
											size="sm"
											className="bg-[#337ab7] hover:bg-blue-800 text-white"
											onClick={() => router.push(`/processes/${process.id}`)}
										>
											Calcular Encargos
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* Empty State */}
				{filteredProcesses.length === 0 && (
					<div className="bg-white rounded-xl border border-gray-200 p-12 text-center mt-6">
						<p className="text-gray-600">
							{searchTerm || statusFilter !== "all"
								? "Nenhum processo encontrado com os filtros aplicados"
								: "Nenhum processo encontrado"}
						</p>
					</div>
				)}
			</div>
		</ProtectedRoute>
	);
}