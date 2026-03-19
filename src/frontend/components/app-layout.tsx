"use client";

import { useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, FileText, Clock, Settings, LogOut, User, AlertTriangle, Building2 } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useFilial } from "./filial-provider";
import { MicrosoftLoginButton } from "./microsoft-login-button";

interface AppLayoutProps {
	children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const router = useRouter();
	const pathname = usePathname();
	const { user, signOut, loading } = useAuth();
	const { filiais, selectedFilCod, setSelectedFilCod, loading: filiaisLoading } = useFilial();

	/** Extrai nome curto da filial: "COLUMBIA TRADING S/A - ITAJAÍ/SC" → "2 | SC - Itajaí" */
	function shortFilialName(filCod: number, filDesNome: string, ufEspSigla: string): string {
		const match = filDesNome.match(/- (.+?)\//);
		const city = match ? match[1].trim() : ufEspSigla;
		return `${filCod} | ${ufEspSigla} - ${city.charAt(0).toUpperCase()}${city.slice(1).toLowerCase()}`;
	}

	const isActive = (path: string) => {
		if (path === "/") {
			return pathname === "/";
		}
		return pathname?.startsWith(path);
	};

	const handleSignOut = async () => {
		try {
			await signOut();
			router.push("/");
		} catch (error) {
			console.error("Error signing out:", error);
		}
	};

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<div
				className="fixed top-0 left-0 right-0 z-20"
				style={{ background: "linear-gradient(90deg, #0072bc 69%, #070f26 89%)" }}
			>
				<div className="flex items-center justify-between px-6 py-4">
					<div className="flex items-center gap-3">
						<button
							onClick={() => setSidebarOpen(!sidebarOpen)}
							className="p-1 hover:bg-blue-600 rounded transition"
						>
							<Menu size={24} className="text-white" />
						</button>
						<h1 className="text-white text-xl font-bold">Calculadora de Encargos Financeiros</h1>
						{!filiaisLoading && filiais.length > 0 && (
							<div className="flex items-center gap-2 ml-4">
								<Building2 size={16} className="text-white/70" />
								<select
									value={selectedFilCod}
									onChange={(e) => setSelectedFilCod(Number(e.target.value))}
									className="bg-white/10 text-white text-sm font-medium border border-white/20 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
								>
									{filiais.map((f) => (
										<option key={f.filCod} value={f.filCod} className="text-gray-800">
											{shortFilialName(f.filCod, f.filDesNome, f.ufEspSigla)}
										</option>
									))}
								</select>
							</div>
						)}
					</div>
					{!loading && (
						<div className="flex items-center gap-3">
							{user ? (
								<div className="flex items-center gap-3">
									<div className="text-white text-sm">
										<div className="font-medium">{user.user_metadata?.full_name || user.email}</div>
										<div className="text-xs opacity-90">{user.email}</div>
									</div>
									<button
										onClick={handleSignOut}
										className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition flex items-center gap-2"
									>
										<LogOut size={18} />
										Sair
									</button>
								</div>
							) : (
								<div className="w-64">
									<MicrosoftLoginButton />
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="flex pt-20">
				{/* Sidebar */}
				<div
					className={`${sidebarOpen ? "w-56" : "w-0"
						} transition-all duration-300 bg-white border-r border-gray-200 overflow-hidden fixed left-0 top-20 bottom-0 z-10 flex flex-col`}
				>
					<div className="p-4 flex-1">
						<button
							onClick={() => router.push("/")}
							className={`w-full font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 mb-4 transition ${isActive("/")
								? "bg-[#337ab7] text-white"
								: "text-gray-600 hover:bg-gray-50"
								}`}
						>
							<FileText size={18} />
							Processos
						</button>

						<button
							onClick={() => router.push("/calculations")}
							className={`w-full font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 mb-4 transition ${isActive("/calculations")
								? "bg-[#337ab7] text-white"
								: "text-gray-600 hover:bg-gray-50"
								}`}
						>
							<Clock size={18} />
							Histórico
						</button>

						<button
							onClick={() => router.push("/analysis/delays")}
							className={`w-full font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 mb-4 transition ${isActive("/analysis/delays")
									? "bg-[#337ab7] text-white"
									: "text-gray-600 hover:bg-gray-50"
								}`}
						>
							<AlertTriangle size={18} />
							Análise de Atrasos
						</button>
						<button
							onClick={() => router.push("/settings")}
							className={`w-full font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 mb-4 transition ${isActive("/settings")
								? "bg-[#337ab7] text-white"
								: "text-gray-600 hover:bg-gray-50"
								}`}
						>
							<Settings size={18} />
							Configurações
						</button>
					</div>
					{user && (
						<button
							onClick={handleSignOut}
							className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-2 border-t border-gray-200 w-full transition"
						>
							<LogOut size={18} />
							Fazer logout
						</button>
					)}
				</div>

				{/* Main Content */}
				<div
					className={`${sidebarOpen ? "ml-56" : "ml-0"
						} flex-1 transition-all duration-300`}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
