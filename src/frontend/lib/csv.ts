/**
 * Utilitário de geração e download de CSV para exportação de relatórios.
 * Segue RFC 4180 para escaping de campos.
 */

/**
 * Escapa um campo CSV conforme RFC 4180.
 * Envolve em aspas duplas se o valor contém vírgulas, aspas ou quebras de linha.
 */
function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formata data (ISO ou timestamp) como dd/mm/yyyy, compensando fuso horário.
 * Retorna string vazia se input for nulo/indefinido.
 */
function formatDateForCSV(dateStr: string | number | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const adjusted = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  const day = String(adjusted.getDate()).padStart(2, '0');
  const month = String(adjusted.getMonth() + 1).padStart(2, '0');
  const year = adjusted.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formata número com locale pt-BR (ex: 1.234,56) sem símbolo de moeda.
 */
function formatCurrencyForCSV(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '';
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Monta um array de 12 campos para uma linha do CSV.
 *
 * Colunas: Código | Referência | Cliente | Incoterm |
 *          Taxa | Moeda | Vlr. Negociado | Vlr. Nacional |
 *          Documento | Vencimento | Baixa | Atraso (dias)
 */
function buildCSVRow(
  process: any,
  contract: any | null,
  title: any | null,
  discharge: any | null
): string[] {
  const codigo = String(process.priCod || '');
  const referencia = process.priEspRefcliente || process.processNumber || String(process.priCod || '');
  const cliente = process.dpeNomPessoa || process.clientName || '';
  const incoterm = process.incoterm || '';

  const taxa = contract?.imcFltTxFec != null
    ? Number(contract.imcFltTxFec).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : '';
  const moeda = contract?.moeEspNome || '';
  const vlrNegociado = contract?.vlrMneg != null ? formatCurrencyForCSV(Number(contract.vlrMneg)) : '';
  const vlrNacional = contract?.vlrTotalNac != null ? formatCurrencyForCSV(Number(contract.vlrTotalNac)) : '';

  let documento = '';
  let vencimento = '';
  let baixa = '';
  let atrasoDias = '';

  if (title && discharge) {
    documento = title.titEspNumero || title.docEspNumero || String(title.titCod || '');
    vencimento = formatDateForCSV(title.titDtaVencimento);
    baixa = formatDateForCSV(discharge.borDtaMvto || discharge.bxaDtaBaixa);

    const dueDate = title.titDtaVencimento ? new Date(title.titDtaVencimento) : null;
    const paymentDateStr = discharge.borDtaMvto || discharge.bxaDtaBaixa;
    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;

    if (dueDate && paymentDate && paymentDate > dueDate) {
      const days = Math.ceil(
        Math.abs(paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      atrasoDias = String(days);
    }
  }

  return [
    codigo, referencia, cliente, incoterm,
    taxa, moeda, vlrNegociado, vlrNacional,
    documento, vencimento, baixa, atrasoDias,
  ];
}

export interface ExportDelaysCSVParams {
  processes: any[];
}

/**
 * Gera CSV com todos os contratos e dispara download.
 *
 * Lógica de mapeamento:
 * - Para cada processo, coleta documentos atrasados (paymentDate > dueDate)
 * - Se há documentos atrasados: primeiro contrato recebe 1 linha por doc atrasado;
 *   contratos adicionais recebem 1 linha com colunas de documento vazias
 * - Se não há documentos atrasados: cada contrato recebe 1 linha com colunas doc vazias
 * - Processos sem contratos: 1 linha com apenas info do processo
 */
export function exportDelaysCSV({ processes }: ExportDelaysCSVParams): void {
  const headers = [
    'Código', 'Referência', 'Cliente', 'Incoterm',
    'Taxa', 'Moeda', 'Vlr. Negociado', 'Vlr. Nacional',
    'Documento', 'Vencimento', 'Baixa', 'Atraso (dias)',
  ];

  const rows: string[][] = [];

  for (const process of processes) {
    const contracts = process.contracts || [];
    const titles = process.payments || [];

    // Coletar documentos atrasados (mesma lógica da página de atrasos)
    const delayedDischarges: Array<{ title: any; discharge: any }> = [];

    for (const title of titles) {
      const dueDate = title.titDtaVencimento ? new Date(title.titDtaVencimento) : null;
      if (!dueDate) continue;

      for (const discharge of (title.discharges || [])) {
        const paymentDateStr = discharge.borDtaMvto || discharge.bxaDtaBaixa;
        const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
        if (paymentDate && paymentDate > dueDate) {
          delayedDischarges.push({ title, discharge });
        }
      }
    }

    if (contracts.length === 0) {
      // Processo sem contratos
      if (delayedDischarges.length > 0) {
        for (const { title, discharge } of delayedDischarges) {
          rows.push(buildCSVRow(process, null, title, discharge));
        }
      } else {
        rows.push(buildCSVRow(process, null, null, null));
      }
    } else if (delayedDischarges.length > 0) {
      // Primeiro contrato recebe todas as linhas de docs atrasados
      for (const { title, discharge } of delayedDischarges) {
        rows.push(buildCSVRow(process, contracts[0], title, discharge));
      }
      // Contratos adicionais recebem linha própria sem doc
      for (let i = 1; i < contracts.length; i++) {
        rows.push(buildCSVRow(process, contracts[i], null, null));
      }
    } else {
      // Sem atrasos: cada contrato recebe 1 linha
      for (const contract of contracts) {
        rows.push(buildCSVRow(process, contract, null, null));
      }
    }
  }

  // Montar conteúdo CSV
  const csvContent = [
    headers.map(escapeCSVField).join(','),
    ...rows.map(row => row.map(escapeCSVField).join(',')),
  ].join('\r\n');

  // UTF-8 BOM para compatibilidade com Excel (caracteres portugueses)
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Disparar download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-contratos_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
