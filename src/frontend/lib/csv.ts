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
 * Monta array de 16 campos para a aba "Contratos"
 */
function buildContratosRow(
  process: any,
  contract: any | null,
  title: any | null,
  discharge: any | null
): (string | number | null)[] {
  const filCod = title?.filCod ?? contract?.filCod ?? process?.filCod ?? '';
  const codigo = process.priCod || '';
  const referencia = process.priEspRefcliente || process.processNumber || String(process.priCod || '');
  const cliente = process.dpeNomPessoa || process.clientName || '';
  const incoterm = process.incoterm || process.incEspSigla || '';

  const taxa = contract?.imcFltTxFec != null ? Number(contract.imcFltTxFec) : null;
  const moeda = contract?.moeEspNome || '';
  const vlrNegociado = contract?.vlrMneg != null ? Number(contract.vlrMneg) : null;
  const vlrNacional = contract?.vlrTotalNac != null ? Number(contract.vlrTotalNac) : null;

  let documento = '';
  let vencimento = '';
  let baixa = '';
  let atrasoDias: number | '' = '';
  let valorDocumento: number | null = null;
  let valorBaixado: number | null = null;
  let valorEmAberto: number | null = null;

  if (title && discharge) {
    // MUDANÇA: usar docCod ao invés de titEspNumero
    documento = title.docCod || title.docEspNumero || String(title.titCod || '');
    vencimento = formatDateForExport(title.titDtaVencimento);
    baixa = formatDateForExport(discharge.borDtaMvto || discharge.bxaDtaBaixa);

    // MUDANÇA: valorDocumento agora é o total da NF
    valorDocumento = title.docMnyValor != null ? Number(title.docMnyValor) : null;

    // NOVO: valorBaixado é o que estava em bxaMnyValor
    valorBaixado = discharge.bxaMnyValor != null ? Number(discharge.bxaMnyValor) : null;

    // NOVO: calcular valor em aberto
    if (valorDocumento != null && valorBaixado != null) {
      valorEmAberto = valorDocumento - valorBaixado;
    }

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
    valorDocumento, valorBaixado, valorEmAberto
  ];
}

/**
 * Monta array de 12 campos para a aba "Encargos Financeiros"
 * Agora inclui dados de títulos/baixas para contexto completo
 */
function buildEncargosRow(
  process: any,
  title: any | null,
  discharge: any | null,
  encargosFinanceiros: number
): (string | number | null)[] {
  const filCod = title?.filCod ?? process?.filCod ?? '';
  const codigo = process.priCod || '';
  const referencia = process.priEspRefcliente || process.processNumber || String(process.priCod || '');
  const cliente = process.dpeNomPessoa || process.clientName || '';

  let documento = '';
  let valorDocumento: number | null = null;
  let valorBaixado: number | null = null;
  let vencimento = '';
  let valorEmAberto: number | null = null;
  let dataBaixa = '';
  let diasAtraso: number | '' = '';

  if (title && discharge) {
    documento = title.docCod || title.docEspNumero || String(title.titCod || '');
    valorDocumento = title.docMnyValor != null ? Number(title.docMnyValor) : null;
    valorBaixado = discharge.bxaMnyValor != null ? Number(discharge.bxaMnyValor) : null;
    vencimento = formatDateForExport(title.titDtaVencimento);
    dataBaixa = formatDateForExport(discharge.borDtaMvto || discharge.bxaDtaBaixa);

    // Calcular valor em aberto
    if (valorDocumento != null && valorBaixado != null) {
      valorEmAberto = valorDocumento - valorBaixado;
    }

    // Calcular dias em atraso
    const dueDate = title.titDtaVencimento ? new Date(title.titDtaVencimento) : null;
    const paymentDateStr = discharge.borDtaMvto || discharge.bxaDtaBaixa;
    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;

    if (dueDate && paymentDate && paymentDate > dueDate) {
      diasAtraso = Math.ceil(
        Math.abs(paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  }

  return [
    filCod, codigo, referencia, cliente,
    documento, valorDocumento, valorBaixado, encargosFinanceiros,
    vencimento, valorEmAberto, dataBaixa, diasAtraso
  ];
}

/**
 * Constrói array de arrays para a aba "Contratos"
 * Retorna: [headers, ...dataRows]
 */
function buildContratosSheetData(processes: any[]): (string | number | null)[][] {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente', 'Incoterm',
    'Taxa', 'Moeda', 'Vlr. Negociado', 'Vlr. Nacional',
    'Documento (NF)', 'Vencimento', 'Baixa', 'Atraso (dias)',
    'Valor do Documento', 'Valor Baixado', 'Valor em Aberto'
  ];

  const dataRows: (string | number | null)[][] = [];

  for (const process of processes) {
    const contracts = process.contracts || [];

    // Pular processos sem contratos
    if (contracts.length === 0) continue;

    const titles = process.payments || [];

    // Coletar todas as baixas
    const allDischarges: Array<{ title: any; discharge: any }> = [];
    for (const title of titles) {
      for (const discharge of (title.discharges || [])) {
        allDischarges.push({ title, discharge });
      }
    }

    if (allDischarges.length > 0) {
      // Todas as baixas vão para o primeiro contrato
      for (const { title, discharge } of allDischarges) {
        dataRows.push(buildContratosRow(process, contracts[0], title, discharge));
      }
      // Demais contratos: linha sem informação de baixa
      for (let i = 1; i < contracts.length; i++) {
        dataRows.push(buildContratosRow(process, contracts[i], null, null));
      }
    } else {
      // Tem contratos mas não tem baixas: uma linha por contrato
      for (const contract of contracts) {
        dataRows.push(buildContratosRow(process, contract, null, null));
      }
    }
  }

  return [headers, ...dataRows];
}

/**
 * Constrói array de arrays para a aba "Encargos Financeiros"
 * Nova lógica: inclui dados de títulos e baixas
 */
function buildEncargosSheetData(
  processes: any[],
  encargosByProcess: Record<string, number | null>
): (string | number | null)[][] {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente',
    'Documento (NF)', 'Valor do Documento', 'Valor Baixado', 'Encargos Financeiros',
    'Vencimento', 'Valor em Aberto', 'Data Baixa', 'Dias em Atraso'
  ];

  const dataRows: (string | number | null)[][] = [];

  for (const process of processes) {
    const priCod = String(process.priCod ?? '');
    const encargos = encargosByProcess[priCod];

    // Apenas processos com encargos
    if (encargos == null || encargos === 0) continue;

    const titles = process.payments || [];

    // Coletar todas as baixas
    const allDischarges: Array<{ title: any; discharge: any }> = [];
    for (const title of titles) {
      for (const discharge of (title.discharges || [])) {
        allDischarges.push({ title, discharge });
      }
    }

    if (allDischarges.length > 0) {
      // Uma linha por baixa
      for (const { title, discharge } of allDischarges) {
        dataRows.push(buildEncargosRow(process, title, discharge, encargos));
      }
    } else {
      // Sem baixas: linha só com dados de processo e encargos
      dataRows.push(buildEncargosRow(process, null, null, encargos));
    }
  }

  return [headers, ...dataRows];
}

/**
 * Cria worksheet formatado para a aba "Contratos"
 */
function createContratosSheet(sheetData: (string | number | null)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Formato financeiro brasileiro
  const fmtFinanceiro = '#.##0,00';
  const fmtReais = '"R$ "#.##0,00';

  const colLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];
  const numRows = sheetData.length;

  // Aplicar formatação nas colunas numéricas
  for (let r = 1; r < numRows; r++) {
    // Taxa (F, col 5)
    const cTaxa = ws[colLetters[5] + (r + 1)];
    if (cTaxa && (typeof cTaxa.v === 'number' || cTaxa.t === 'n')) {
      cTaxa.z = fmtFinanceiro;
      cTaxa.t = 'n';
    }

    // Vlr. Negociado (H, col 7)
    const cVlrNeg = ws[colLetters[7] + (r + 1)];
    if (cVlrNeg && (typeof cVlrNeg.v === 'number' || cVlrNeg.t === 'n')) {
      cVlrNeg.z = fmtFinanceiro;
      cVlrNeg.t = 'n';
    }

    // Vlr. Nacional (I, col 8) - Com R$
    const cVlrNac = ws[colLetters[8] + (r + 1)];
    if (cVlrNac && (typeof cVlrNac.v === 'number' || cVlrNac.t === 'n')) {
      cVlrNac.z = fmtReais;
      cVlrNac.t = 'n';
    }

    // Atraso (M, col 12) - Inteiro
    const cAtraso = ws[colLetters[12] + (r + 1)];
    if (cAtraso && (typeof cAtraso.v === 'number' || cAtraso.t === 'n')) {
      cAtraso.z = '0';
      cAtraso.t = 'n';
    }

    // NOVO: Valor do Documento (N, col 13)
    const cValorDoc = ws[colLetters[13] + (r + 1)];
    if (cValorDoc && (typeof cValorDoc.v === 'number' || cValorDoc.t === 'n')) {
      cValorDoc.z = fmtReais;
      cValorDoc.t = 'n';
    }

    // NOVO: Valor Baixado (O, col 14)
    const cValorBaixado = ws[colLetters[14] + (r + 1)];
    if (cValorBaixado && (typeof cValorBaixado.v === 'number' || cValorBaixado.t === 'n')) {
      cValorBaixado.z = fmtReais;
      cValorBaixado.t = 'n';
    }

    // NOVO: Valor em Aberto (P, col 15)
    const cValorAberto = ws[colLetters[15] + (r + 1)];
    if (cValorAberto && (typeof cValorAberto.v === 'number' || cValorAberto.t === 'n')) {
      cValorAberto.z = fmtReais;
      cValorAberto.t = 'n';
    }
  }

  // Largura das colunas (16 colunas)
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
    { wch: 14 },  // Documento (NF)
    { wch: 14 },  // Vencimento
    { wch: 14 },  // Baixa
    { wch: 12 },  // Atraso (dias)
    { wch: 16 },  // Valor do Documento
    { wch: 16 },  // Valor Baixado
    { wch: 16 },  // Valor em Aberto
  ];

  // Congelar cabeçalho
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ state: 'frozen', ySplit: 1 });

  return ws;
}

/**
 * Cria worksheet formatado para a aba "Encargos Financeiros"
 */
function createEncargosSheet(sheetData: (string | number | null)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Formato financeiro brasileiro
  const fmtFinanceiro = '#.##0,00';
  const fmtReais = '"R$ "#.##0,00';

  const colLetters = ['A','B','C','D','E','F','G','H','I','J','K','L'];
  const numRows = sheetData.length;

  // Aplicar formatação nas colunas numéricas
  for (let r = 1; r < numRows; r++) {
    // Valor do Documento (F, col 5)
    const cValorDoc = ws[colLetters[5] + (r + 1)];
    if (cValorDoc && (typeof cValorDoc.v === 'number' || cValorDoc.t === 'n')) {
      cValorDoc.z = fmtReais;
      cValorDoc.t = 'n';
    }

    // Valor Baixado (G, col 6)
    const cValorBaixado = ws[colLetters[6] + (r + 1)];
    if (cValorBaixado && (typeof cValorBaixado.v === 'number' || cValorBaixado.t === 'n')) {
      cValorBaixado.z = fmtReais;
      cValorBaixado.t = 'n';
    }

    // Encargos Financeiros (H, col 7)
    const cEncargos = ws[colLetters[7] + (r + 1)];
    if (cEncargos && (typeof cEncargos.v === 'number' || cEncargos.t === 'n')) {
      cEncargos.z = fmtFinanceiro;
      cEncargos.t = 'n';
    }

    // Valor em Aberto (J, col 9)
    const cValorAberto = ws[colLetters[9] + (r + 1)];
    if (cValorAberto && (typeof cValorAberto.v === 'number' || cValorAberto.t === 'n')) {
      cValorAberto.z = fmtReais;
      cValorAberto.t = 'n';
    }

    // Dias em Atraso (L, col 11)
    const cDiasAtraso = ws[colLetters[11] + (r + 1)];
    if (cDiasAtraso && (typeof cDiasAtraso.v === 'number' || cDiasAtraso.t === 'n')) {
      cDiasAtraso.z = '0';
      cDiasAtraso.t = 'n';
    }
  }

  // Largura das colunas (12 colunas)
  ws['!cols'] = [
    { wch: 8 },   // Filial
    { wch: 10 },  // Código
    { wch: 18 },  // Referência
    { wch: 30 },  // Cliente
    { wch: 14 },  // Documento (NF)
    { wch: 16 },  // Valor do Documento
    { wch: 16 },  // Valor Baixado
    { wch: 18 },  // Encargos Financeiros
    { wch: 14 },  // Vencimento
    { wch: 16 },  // Valor em Aberto
    { wch: 14 },  // Data Baixa
    { wch: 12 },  // Dias em Atraso
  ];

  // Congelar cabeçalho
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ state: 'frozen', ySplit: 1 });

  return ws;
}

export interface ExportDelaysParams {
  processes: any[];
  /** Mapa priCod -> valor de encargos financeiros (pidMnyValormn onde ctpDesNome = ENCARGOS FINANCEIROS) */
  encargosByProcess?: Record<string, number | null>;
}

/** @deprecated Use exportDelaysXLSX instead */
export const exportDelaysCSV = exportDelaysXLSX;

/**
 * Gera XLSX com duas abas separadas (Contratos e Encargos Financeiros) e dispara download.
 *
 * Estrutura:
 * - Aba "Contratos": processos com contratos, incluindo baixas e atrasos
 * - Aba "Encargos Financeiros": processos com encargos financeiros
 */
export function exportDelaysXLSX({ processes, encargosByProcess = {} }: ExportDelaysParams): void {
  // 1. Construir dados das duas abas
  const contratosData = buildContratosSheetData(processes);
  const encargosData = buildEncargosSheetData(processes, encargosByProcess);

  // 2. Criar workbook
  const wb = XLSX.utils.book_new();

  // 3. Criar e adicionar aba "Contratos"
  const wsContratos = createContratosSheet(contratosData);
  XLSX.utils.book_append_sheet(wb, wsContratos, 'Contratos');

  // 4. Criar e adicionar aba "Encargos Financeiros"
  const wsEncargos = createEncargosSheet(encargosData);
  XLSX.utils.book_append_sheet(wb, wsEncargos, 'Encargos Financeiros');

  // 5. Disparar download
  const filename = `relatorio-contratos_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}
