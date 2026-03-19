import type { CalculationPayload } from '@/lib/types';

interface CalcParametersProps {
  payload: CalculationPayload;
}

const SOURCE_LABELS: Record<string, string> = {
  bcb: 'BCB',
  conexos: 'Conexos',
  manual: 'Manual',
};

export function CalcParameters({ payload }: CalcParametersProps) {
  const snapshot = payload.inputSnapshot;
  if (!snapshot) return null;

  const taxaAnual = snapshot.cdiUsado * snapshot.baseDias;
  const taxaDiaria = snapshot.cdiUsado;
  const sourceLabel = SOURCE_LABELS[snapshot.cdiSource] || snapshot.cdiSource;

  return (
    <section className="border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Parâmetros do Cálculo
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
        <div>
          <dt className="text-xs text-muted-foreground">Taxa Aplicada (% a.a.)</dt>
          <dd className="text-sm font-medium mt-0.5 flex items-center gap-2">
            {taxaAnual.toFixed(4)}%
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
              {sourceLabel}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Taxa Diária (%)</dt>
          <dd className="text-sm font-medium mt-0.5">
            {taxaDiaria.toFixed(6)}%
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Base de Dias</dt>
          <dd className="text-sm font-medium mt-0.5">{snapshot.baseDias}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fonte dos Movimentos</dt>
          <dd className="text-sm font-medium mt-0.5 capitalize">{snapshot.movimentosSource}</dd>
        </div>
        {snapshot.cdiSource !== 'conexos' && snapshot.cdiConexosRaw != null && snapshot.cdiConexosRaw > 0 && (
          <div>
            <dt className="text-xs text-muted-foreground">CDI Conexos (referência)</dt>
            <dd className="text-sm text-muted-foreground mt-0.5">
              {(snapshot.cdiConexosRaw * snapshot.baseDias).toFixed(4)}% a.a.
            </dd>
          </div>
        )}
      </div>
    </section>
  );
}
