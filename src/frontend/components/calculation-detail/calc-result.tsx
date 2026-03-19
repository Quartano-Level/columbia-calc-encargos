interface CalcResultProps {
  totalEncargos: number;
  totalDesembolso: number;
  itemCount?: number;
  currency?: 'BRL' | 'USD';
}

function fmtValue(value: number, currency: 'BRL' | 'USD'): string {
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'BRL' ? `R$ ${formatted}` : formatted;
}

export function CalcResult({ totalEncargos, totalDesembolso, itemCount, currency = 'USD' }: CalcResultProps) {
  const label = currency === 'BRL' ? 'BRL' : 'USD';

  return (
    <section className="border rounded-lg p-5 bg-blue-50/50">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Resultado
        {itemCount != null && (
          <span className="ml-2 font-normal text-xs text-muted-foreground">
            — calculado sobre {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </span>
        )}
      </h2>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-muted-foreground">Total Valor Base ({label})</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{fmtValue(totalDesembolso, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Encargos Financeiros ({label})</p>
          <p className="text-2xl font-bold text-blue-700 tabular-nums mt-1">{fmtValue(totalEncargos, currency)}</p>
        </div>
      </div>
    </section>
  );
}
