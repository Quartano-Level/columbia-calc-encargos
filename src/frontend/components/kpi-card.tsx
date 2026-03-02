"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode, ElementType } from "react";

interface KpiCardProps {
	label: string;
	value: ReactNode;
	icon: ElementType;
	trend?: number; // variação percentual (positivo=subiu, negativo=desceu)
	trendLabel?: string; // ex: "vs mês anterior"
	loading?: boolean;
	variant?: "default" | "danger" | "warning" | "success" | "info";
	subtitle?: string;
	invertTrend?: boolean; // quando true, queda é boa (ex: processos com atraso diminuindo)
}

const variantStyles = {
	default: {
		card: "border-gray-200 bg-white",
		iconBg: "bg-gray-100",
		icon: "text-gray-500",
		value: "text-gray-900",
	},
	danger: {
		card: "border-red-100 bg-red-50/30",
		iconBg: "bg-red-100",
		icon: "text-red-500",
		value: "text-red-700",
	},
	warning: {
		card: "border-amber-100 bg-amber-50/30",
		iconBg: "bg-amber-100",
		icon: "text-amber-600",
		value: "text-amber-700",
	},
	success: {
		card: "border-green-100 bg-green-50/30",
		iconBg: "bg-green-100",
		icon: "text-green-600",
		value: "text-green-700",
	},
	info: {
		card: "border-blue-100 bg-blue-50/30",
		iconBg: "bg-blue-100",
		icon: "text-blue-600",
		value: "text-blue-700",
	},
};

export function KpiCard({
	label,
	value,
	icon: Icon,
	trend,
	trendLabel = "vs mês anterior",
	loading,
	variant = "default",
	subtitle,
	invertTrend = false,
}: KpiCardProps) {
	const styles = variantStyles[variant];

	if (loading) {
		return (
			<div className={cn("rounded-xl border p-4 shadow-sm", styles.card)}>
				<div className="flex items-center justify-between mb-3">
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-7 w-7 rounded-lg" />
				</div>
				<Skeleton className="h-8 w-32 mb-2" />
				<Skeleton className="h-3 w-20" />
			</div>
		);
	}

	const hasTrend = trend !== undefined && trend !== null;
	const isPositive = hasTrend && trend! > 0;
	const isNeutral = hasTrend && trend === 0;
	const isTrendGood = invertTrend ? !isPositive : isPositive;

	return (
		<div className={cn("rounded-xl border p-4 shadow-sm overflow-hidden relative", styles.card)}>
			<div className="flex items-center justify-between mb-3">
				<span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">
					{label}
				</span>
				<div className={cn("p-1.5 rounded-lg", styles.iconBg)}>
					<Icon size={16} className={styles.icon} />
				</div>
			</div>

			<div className={cn("text-2xl font-black leading-tight mb-1", styles.value)}>
				{value}
			</div>

			<div className="flex items-center justify-between min-h-[16px]">
				{subtitle && (
					<p className="text-[10px] text-gray-400 leading-tight">{subtitle}</p>
				)}
				{hasTrend && !isNeutral && (
					<div
						className={cn(
							"flex items-center gap-0.5 text-[10px] font-bold ml-auto",
							isTrendGood ? "text-green-600" : "text-red-600"
						)}
					>
						{isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
						{Math.abs(trend!).toFixed(1)}%
						{trendLabel && (
							<span className="text-gray-400 font-normal ml-0.5">{trendLabel}</span>
						)}
					</div>
				)}
				{hasTrend && isNeutral && (
					<div className="flex items-center gap-0.5 text-[10px] text-gray-400 ml-auto">
						<Minus size={11} />
						<span>sem variação</span>
					</div>
				)}
			</div>
		</div>
	);
}
