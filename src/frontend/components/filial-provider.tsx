"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { fetchFiliais, Filial } from "@/lib/api";

interface FilialContextType {
	filiais: Filial[];
	selectedFilCod: number;
	setSelectedFilCod: (filCod: number) => void;
	loading: boolean;
}

const FilialContext = createContext<FilialContextType>({
	filiais: [],
	selectedFilCod: 2,
	setSelectedFilCod: () => {},
	loading: true,
});

export function useFilial() {
	return useContext(FilialContext);
}

const STORAGE_KEY = "columbia-filial-selected";

export function FilialProvider({ children }: { children: ReactNode }) {
	const [filiais, setFiliais] = useState<Filial[]>([]);
	const [selectedFilCod, setSelectedFilCodState] = useState<number>(() => {
		if (typeof window !== "undefined") {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) return Number(stored);
		}
		return 2; // default: SC - Itajaí
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchFiliais()
			.then((data) => setFiliais(data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	function setSelectedFilCod(filCod: number) {
		setSelectedFilCodState(filCod);
		if (typeof window !== "undefined") {
			localStorage.setItem(STORAGE_KEY, String(filCod));
		}
	}

	return (
		<FilialContext.Provider value={{ filiais, selectedFilCod, setSelectedFilCod, loading }}>
			{children}
		</FilialContext.Provider>
	);
}
