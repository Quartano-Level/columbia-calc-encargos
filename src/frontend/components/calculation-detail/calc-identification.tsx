import type { CalculationRecord, CalculationPayloadV2 } from '@/lib/types';

interface CalcIdentificationProps {
  record: CalculationRecord;
}

function isV2(payload: any): payload is CalculationPayloadV2 {
  return payload?.payloadVersion === 2 && Array.isArray(payload?.items);
}

export function CalcIdentification({ record }: CalcIdentificationProps) {
  const payload = record.payload;
  const v2 = isV2(payload);

  // Processo: v2 usa refExterna, v1 usa processo_numero
  const processoDisplay = v2
    ? payload.refExterna || payload.processoNumero || record.processo_numero || record.processo_id
    : record.processo_numero || (payload as any)?.processoNumero || record.processo_id;

  const clienteDisplay = v2
    ? payload.clienteNome || record.cliente_nome || record.cliente_id
    : record.cliente_nome || (payload as any)?.clienteNome || record.cliente_id;

  return (
    <section className="border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Identificação
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3">
        <Field label="Processo" value={processoDisplay} />
        <Field label="Cód. Processo" value={record.processo_id} />
        <Field label="Cliente" value={clienteDisplay} />
        <Field
          label="Status"
          value={
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                record.status === 'submitted'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {record.status === 'submitted' ? 'Submetido' : 'Calculado'}
            </span>
          }
        />
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{typeof value === 'string' ? value || '—' : value}</dd>
    </div>
  );
}
