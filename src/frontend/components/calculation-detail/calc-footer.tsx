import type { CalculationRecord } from '@/lib/types';

interface CalcFooterProps {
  record: CalculationRecord;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function CalcFooter({ record }: CalcFooterProps) {
  if (!record.submitted_at) return null;

  return (
    <footer className="border-t pt-4 mt-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium">Submetido em:</span>{' '}
          {formatDate(record.submitted_at)}
        </span>
      </div>
    </footer>
  );
}
