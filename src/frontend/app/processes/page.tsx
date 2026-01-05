"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

/**
 * Redirects to the root page to avoid duplication.
 * The root page (/) contains the polished "Processos de Importação" view 
 * which uses the `with-contracts` endpoint.
 */
export default function ProcessesPage() {
	const router = useRouter();

	useEffect(() => {
		router.replace("/");
	}, [router]);

	return (
		<div className="flex items-center justify-center min-h-screen">
			<Spinner className="w-8 h-8 text-[#337ab7]" />
		</div>
	);
}

