"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Process } from "@/lib/types";
import { fetchProcesses } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export default function ProcessesPage() {
	const [processes, setProcesses] = useState<Process[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const router = useRouter();

	useEffect(() => {
		loadProcesses();
	}, []);

	async function loadProcesses() {
		try {
			setLoading(true);
			setError(null);
			const data = await fetchProcesses();
			setProcesses(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load processes");
		} finally {
			setLoading(false);
		}
	}

	// Filtro local dos processos
	const filteredProcesses = processes.filter((process) => {
		if (!searchTerm.trim()) return true;
		const term = searchTerm.trim().toLowerCase();
		const rawProcess = process as any;
		const priCod = String(rawProcess.priCod || process.id || "").toLowerCase();
		const refExterna = String(rawProcess.priEspRefcliente || "").toLowerCase();
		return priCod.includes(term) || refExterna.includes(term);
	});

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<Spinner className="w-8 h-8" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="container mx-auto p-6">
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<Button onClick={() => loadProcesses()} className="mt-4">
					Tentar novamente
				</Button>
			</div>
		);
	}

	return (
		<ProtectedRoute>
			<div className="container mx-auto p-6">
				<div className="flex justify-between items-center mb-6">
					<div>
						<h1 className="text-3xl font-bold">Processos de Importação</h1>
						<p className="text-muted-foreground mt-2">
							Selecione um processo para calcular os encargos financeiros
						</p>
					</div>
				</div>

				<div className="flex gap-2 mb-6">
					<input
						type="text"
						placeholder="Buscar por código ou referência..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					/>
					{searchTerm && (
						<Button
							variant="outline"
							onClick={() => setSearchTerm("")}
						>
							Limpar
						</Button>
					)}
				</div>

				{filteredProcesses.length > 0 ? (
					<Card>
						<CardContent className="p-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Código do Processo</TableHead>
										<TableHead>Ref. Externa</TableHead>
										<TableHead>Data Pagamento</TableHead>
										<TableHead>Taxa</TableHead>
										<TableHead>Moeda</TableHead>
										<TableHead>Valor da Moeda</TableHead>
										<TableHead className="text-right">Ações</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredProcesses.map((process) => {
										const rawProcess = process as any;
										const priCod = rawProcess.priCod || process.id;
										const refExterna = rawProcess.priEspRefcliente || "";

										return (
											<TableRow
												key={process.id}
												className="cursor-pointer hover:bg-muted/50"
												onClick={() => router.push(`/processes/${process.id}`)}
											>
												<TableCell className="font-medium">{priCod}</TableCell>
												<TableCell>{refExterna}</TableCell>
												<TableCell>-</TableCell>
												<TableCell>-</TableCell>
												<TableCell>-</TableCell>
												<TableCell>-</TableCell>
												<TableCell className="text-right">
													<Button
														size="sm"
														variant="outline"
														onClick={(e) => {
															e.stopPropagation();
															router.push(`/processes/${process.id}`);
														}}
													>
														Ver Detalhes
													</Button>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardContent className="py-12 text-center">
							<p className="text-muted-foreground">
								{searchTerm
									? `Nenhum processo encontrado para "${searchTerm}"`
									: "Nenhum processo encontrado"}
							</p>
						</CardContent>
					</Card>
				)}
			</div>
		</ProtectedRoute>
	);
}

