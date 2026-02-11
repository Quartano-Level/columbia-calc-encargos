/**
 * Utilitário de geração e download de XLSX para exportação de relatórios.
 * Usa SheetJS (xlsx) para gerar planilhas com cabeçalho fixo.
 */
import * as XLSX from 'xlsx';

/**
 * Formata data (ISO ou timestamp) como dd/mm/yyyy, compensando fuso horário.
 */
function formatDateForExport(dateStr: string | number | null | undefined): string {
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
 * Monta um array de 13 campos para uma linha da planilha.
 *
 * Colunas: Filial | Código | Referência | Cliente | Incoterm |
 *          Taxa | Moeda | Vlr. Negociado | Vlr. Nacional |
 *          Documento | Vencimento | Baixa | Atraso (dias)
 */
function buildRow(
  process: any,
  contract: any | null,
  title: any | null,
  discharge: any | null
): (string | number | null)[] {
  const filCod = title?.filCod ?? contract?.filCod ?? '';
  const codigo = process.priCod || '';
  const referencia = process.priEspRefcliente || process.processNumber || String(process.priCod || '');
  const cliente = process.dpeNomPessoa || process.clientName || '';
  const incoterm = process.incoterm || '';

  const taxa = contract?.imcFltTxFec != null ? Number(contract.imcFltTxFec) : null;
  const moeda = contract?.moeEspNome || '';
  const vlrNegociado = contract?.vlrMneg != null ? Number(contract.vlrMneg) : null;
  const vlrNacional = contract?.vlrTotalNac != null ? Number(contract.vlrTotalNac) : null;

  let documento = '';
  let vencimento = '';
  let baixa = '';
  let atrasoDias: number | '' = '';

  if (title && discharge) {
    documento = title.titEspNumero || title.docEspNumero || String(title.titCod || '');
    vencimento = formatDateForExport(title.titDtaVencimento);
    baixa = formatDateForExport(discharge.borDtaMvto || discharge.bxaDtaBaixa);

    const dueDate = title.titDtaVencimento ? new Date(title.titDtaVencimento) : null;
    const paymentDateStr = discharge.borDtaMvto || discharge.bxaDtaBaixa;
    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;

    if (dueDate && paymentDate && paymentDate > dueDate) {
      atrasoDias = Math.ceil(
        Math.abs(paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  }

  return [
    filCod, codigo, referencia, cliente, incoterm,
    taxa, moeda, vlrNegociado, vlrNacional,
    documento, vencimento, baixa, atrasoDias,
  ];
}

export interface ExportDelaysParams {
  processes: any[];
}

/** @deprecated Use exportDelaysXLSX instead */
export const exportDelaysCSV = exportDelaysXLSX;

/**
 * Gera XLSX com todos os contratos e dispara download.
 *
 * Lógica de mapeamento:
 * - Para cada processo, coleta documentos atrasados (paymentDate > dueDate)
 * - Se há documentos atrasados: primeiro contrato recebe 1 linha por doc atrasado;
 *   contratos adicionais recebem 1 linha com colunas de documento vazias
 * - Se não há documentos atrasados: cada contrato recebe 1 linha com colunas doc vazias
 * - Processos sem contratos: 1 linha com apenas info do processo
 */
export function exportDelaysXLSX({ processes }: ExportDelaysParams): void {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente', 'Incoterm',
    'Taxa', 'Moeda', 'Vlr. Negociado', 'Vlr. Nacional',
    'Documento', 'Vencimento', 'Baixa', 'Atraso (dias)',
  ];

  const dataRows: (string | number | null)[][] = [];

  for (const process of processes) {
    const contracts = process.contracts || [];
    const titles = process.payments || [];

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
      if (delayedDischarges.length > 0) {
        for (const { title, discharge } of delayedDischarges) {
          dataRows.push(buildRow(process, null, title, discharge));
        }
      } else {
        dataRows.push(buildRow(process, null, null, null));
      }
    } else if (delayedDischarges.length > 0) {
      for (const { title, discharge } of delayedDischarges) {
        dataRows.push(buildRow(process, contracts[0], title, discharge));
      }
      for (let i = 1; i < contracts.length; i++) {
        dataRows.push(buildRow(process, contracts[i], null, null));
      }
    } else {
      for (const contract of contracts) {
        dataRows.push(buildRow(process, contract, null, null));
      }
    }
  }

  // Montar array de arrays com cabeçalho + dados
  const sheetData = [headers, ...dataRows];

  // Criar worksheet a partir do array
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Definir largura das colunas
  ws['!cols'] = [
    { wch: 8 },   // Filial
    { wch: 10 },  // Código
    { wch: 18 },  // Referência
    { wch: 30 },  // Cliente
    { wch: 10 },  // Incoterm
    { wch: 12 },  // Taxa
    { wch: 12 },  // Moeda
    { wch: 16 },  // Vlr. Negociado
    { wch: 16 },  // Vlr. Nacional
    { wch: 14 },  // Documento
    { wch: 14 },  // Vencimento
    { wch: 14 },  // Baixa
    { wch: 12 },  // Atraso (dias)
  ];

  // Congelar primeira linha (cabeçalho fixo)
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ state: 'frozen', ySplit: 1 });

  // Criar workbook e adicionar worksheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');

  // Disparar download
  const filename = `relatorio-contratos_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}
