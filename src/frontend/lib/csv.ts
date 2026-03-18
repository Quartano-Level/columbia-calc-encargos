/**
 * Utilitário de geração e download de XLSX para exportação de relatórios.
 * Usa SheetJS (xlsx) para gerar planilhas com cabeçalho fixo.
 */
import * as XLSX from 'xlsx-js-style';

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
 * Converte data para número serial Excel (dias desde 30/12/1899).
 * Necessário para que fórmulas de data funcionem corretamente no Excel.
 */
function toExcelSerialDate(dateStr: string | number | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const excelEpoch = new Date(1899, 11, 30);
  return Math.round((d.getTime() - excelEpoch.getTime()) / (1000 * 60 * 60 * 24));
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
 * Monta array de 17 campos para a aba "Encargos Rateados"
 * Modo resumo: colunas J–P = '--', Q = total encargos
 * Modo detalhe: dados do título/baixa + encargo proporcional
 */
function buildEncargosRateadoRow(
  process: any,
  contract: any | null,
  title: any | null,
  discharge: any | null,
  encargosFinanceiros: number,
  isSummary: boolean
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

  if (isSummary) {
    return [
      filCod, codigo, referencia, cliente, incoterm,
      taxa, moeda, vlrNegociado, vlrNacional,
      '--', '--', '--', '--', '--', '--', '--',
      encargosFinanceiros
    ];
  }

  let documento = '';
  let vencimento = '';
  let baixa = '';
  let atrasoDias: number | '' = '';
  let valorDocumento: number | null = null;
  let valorBaixado: number | null = null;
  let valorEmAberto: number | null = null;

  if (title) {
    documento = title.docCod || title.docEspNumero || String(title.titCod || '');
    vencimento = formatDateForExport(title.titDtaVencimento);
    valorDocumento = title.docMnyValor != null ? Number(title.docMnyValor) : null;

    if (discharge) {
      baixa = formatDateForExport(discharge.borDtaMvto || discharge.bxaDtaBaixa);
      valorBaixado = discharge.bxaMnyValor != null ? Number(discharge.bxaMnyValor) : null;

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
  }

  return [
    filCod, codigo, referencia, cliente, incoterm,
    taxa, moeda, vlrNegociado, vlrNacional,
    documento, vencimento, baixa, atrasoDias,
    valorDocumento, valorBaixado, valorEmAberto,
    encargosFinanceiros
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
 * Constrói array de arrays para a aba "Encargos Rateados"
 * Rateio ponderado: encargo proporcional ao docMnyValor de cada título
 */
function buildEncargosRateadoSheetData(
  processes: any[],
  encargosByProcess: Record<string, number | null>
): (string | number | null)[][] {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente', 'Incoterm',
    'Taxa', 'Moeda', 'Vlr. Negociado', 'Vlr. Nacional',
    'Documento', 'Vencimento', 'Baixa', 'Atraso (Dias)',
    'Valor do Documento', 'Valor Baixado', 'Valor em Aberto',
    'Encargos Financeiros'
  ];

  const dataRows: (string | number | null)[][] = [];

  for (const process of processes) {
    const priCod = String(process.priCod ?? '');
    const totalEncargos = encargosByProcess[priCod];

    // Apenas processos com encargos
    if (totalEncargos == null || totalEncargos === 0) continue;

    const contract = process.contracts?.[0] ?? null;
    const titles = process.payments || [];

    // Calcular soma total de docMnyValor (denominador do peso)
    let sumDocMnyValor = 0;
    for (const title of titles) {
      if (title.docMnyValor != null) {
        sumDocMnyValor += Number(title.docMnyValor);
      }
    }

    // 1. Linha resumo com total
    dataRows.push(buildEncargosRateadoRow(process, contract, null, null, totalEncargos, true));

    // 2. Linhas detalhe com encargo rateado
    const allPairs: Array<{ title: any; discharge: any }> = [];
    for (const title of titles) {
      for (const discharge of (title.discharges || [])) {
        allPairs.push({ title, discharge });
      }
    }

    if (allPairs.length > 0) {
      for (const { title, discharge } of allPairs) {
        const peso = (sumDocMnyValor > 0 && title.docMnyValor != null)
          ? Number(title.docMnyValor) / sumDocMnyValor
          : (allPairs.length > 0 ? 1 / allPairs.length : 1);
        const encargosRateados = totalEncargos * peso;
        dataRows.push(buildEncargosRateadoRow(process, contract, title, discharge, encargosRateados, false));
      }
    } else if (titles.length > 0) {
      // Títulos sem baixas: uma linha por título com encargo rateado
      for (const title of titles) {
        const peso = (sumDocMnyValor > 0 && title.docMnyValor != null)
          ? Number(title.docMnyValor) / sumDocMnyValor
          : 1 / titles.length;
        const encargosRateados = totalEncargos * peso;
        dataRows.push(buildEncargosRateadoRow(process, contract, title, null, encargosRateados, false));
      }
    }
    // Se não há títulos, só a linha resumo acima é emitida
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

/**
 * Cria worksheet formatado para a aba "Encargos Rateados" (17 colunas)
 */
function createEncargosRateadoSheet(sheetData: (string | number | null)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Formato financeiro brasileiro
  const fmtFinanceiro = '#.##0,00';
  const fmtReais = '"R$ "#.##0,00';

  const colLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q'];
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

    // Valor do Documento (N, col 13)
    const cValorDoc = ws[colLetters[13] + (r + 1)];
    if (cValorDoc && (typeof cValorDoc.v === 'number' || cValorDoc.t === 'n')) {
      cValorDoc.z = fmtReais;
      cValorDoc.t = 'n';
    }

    // Valor Baixado (O, col 14)
    const cValorBaixado = ws[colLetters[14] + (r + 1)];
    if (cValorBaixado && (typeof cValorBaixado.v === 'number' || cValorBaixado.t === 'n')) {
      cValorBaixado.z = fmtReais;
      cValorBaixado.t = 'n';
    }

    // Valor em Aberto (P, col 15)
    const cValorAberto = ws[colLetters[15] + (r + 1)];
    if (cValorAberto && (typeof cValorAberto.v === 'number' || cValorAberto.t === 'n')) {
      cValorAberto.z = fmtReais;
      cValorAberto.t = 'n';
    }

    // Encargos Financeiros (Q, col 16)
    const cEncargos = ws[colLetters[16] + (r + 1)];
    if (cEncargos && (typeof cEncargos.v === 'number' || cEncargos.t === 'n')) {
      cEncargos.z = fmtReais;
      cEncargos.t = 'n';
    }
  }

  // Largura das colunas (17 colunas)
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
    { wch: 14 },  // Atraso (Dias)
    { wch: 18 },  // Valor do Documento
    { wch: 16 },  // Valor Baixado
    { wch: 16 },  // Valor em Aberto
    { wch: 20 },  // Encargos Financeiros
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

/** @deprecated Use exportDelaysXLSXV2 */
export const exportDelaysCSV = exportDelaysXLSX;

/** @deprecated Use exportDelaysXLSXV2 */
export function exportDelaysXLSX({ processes, encargosByProcess = {} }: ExportDelaysParams): void {
  const contratosData = buildContratosSheetData(processes);
  const encargosData = buildEncargosSheetData(processes, encargosByProcess);
  const encargosRateadoData = buildEncargosRateadoSheetData(processes, encargosByProcess);

  const wb = XLSX.utils.book_new();
  const wsContratos = createContratosSheet(contratosData);
  XLSX.utils.book_append_sheet(wb, wsContratos, 'Contratos');
  const wsEncargos = createEncargosSheet(encargosData);
  XLSX.utils.book_append_sheet(wb, wsEncargos, 'Encargos Financeiros');
  const wsEncargosRateado = createEncargosRateadoSheet(encargosRateadoData);
  XLSX.utils.book_append_sheet(wb, wsEncargosRateado, 'Encargos Rateados');
  const filename = `relatorio-contratos_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}


// ═══════════════════════════════════════════════════════════════
// V2: Exportação baseada em NFs (com297 → com311 → com017)
// ═══════════════════════════════════════════════════════════════

function mapPagoStatus(pago: number | null | undefined): string {
  switch (pago) {
    case 1: return 'Pago';
    case 2: return 'Parcial';
    case 3: return 'Não Pago';
    default: return '—';
  }
}

/**
 * Aba 1 — Visão Hierárquica Completa
 * Hierarquia: Processo → Contrato → NF → Títulos + Encargos
 * Colunas A–Q com células vazias indicando nível hierárquico.
 */
interface HierarchicalSheetResult {
  data: (string | number | null)[][];
  /** Índice do processo (0-based) para cada linha de dados (excluindo header) */
  processGroups: number[];
}

/**
 * Calcula CDI diária (em % por dia corrido) para um período de exposição.
 *
 * Soma as taxas diárias do BCB que caem no intervalo [startDate, endDate]
 * e divide pelo número de dias corridos do período.
 * Resultado comparável diretamente com Tx Enc Dia (%).
 */
function computeCdiForPeriod(
  cdiHistory: CDIHistoryEntry[],
  startDate: string,
  endDate: string,
  calendarDays: number
): number | null {
  if (!cdiHistory.length || calendarDays <= 0) return null;

  const [dStart, dEnd] = startDate <= endDate
    ? [startDate, endDate]
    : [endDate, startDate];

  let sum = 0;
  let count = 0;
  for (const entry of cdiHistory) {
    if (entry.date >= dStart && entry.date <= dEnd) {
      sum += entry.dailyRate;
      count++;
    }
  }

  if (count === 0) return null;
  return sum / calendarDays;
}

/**
 * Aba "Visão Geral" — Uma linha por contrato (plana).
 * Colunas O–T ocultas. Contratos com NF usam Encargos Fin/Vlr Enc Dia/etc;
 * contratos sem NF usam Data Prov, Per Prov Juros, Encargos Prov (com fórmulas Excel).
 */
function buildContractSheetData(processes: any[], cdiHistory?: CDIHistoryEntry[]): HierarchicalSheetResult {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente',
    'Taxa Câmbio', 'Moeda', 'Vlr. Contrato', 'Vlr. Nacional', 'Dt. Fechamento', 'Per. Finmto',
    'Nº NF', 'Data Emissão', 'Vlr. Bruto', 'Vlr. NF',
    'Título / Despesa', 'Vencimento', 'Vlr. Título', 'Total Pago', 'Status Pgto',
    'Data Baixa',
    'Encargos Fin.',
    'Vlr Enc Dia', 'Tx Enc Dia (%)', 'CDI Dia (%)', 'Delta TxEnc-CDI (%)',
    'Data Prov', 'Per Prov Juros', 'Encargos Prov'
  ];

  const rows: (string | number | null)[][] = [];
  const processGroups: number[] = [];

  // CDI diária de referência para contratos sem NF (média recente do histórico)
  const cdiRef = cdiHistory?.length
    ? cdiHistory.reduce((s, e) => s + e.dailyRate, 0) / cdiHistory.length
    : null;

  for (let procIdx = 0; procIdx < processes.length; procIdx++) {
    const proc = processes[procIdx];
    const contracts = proc.contracts || [];
    const invoices = proc.invoices || [];

    const filCod = proc.filCod ?? '';
    const priCod = proc.priCod || '';
    const ref = proc.priEspRefcliente || String(proc.priCod || '');
    const cliente = proc.dpeNomPessoa || '';

    let procTotalEncargos = 0;
    let procTotalNF = 0;
    let firstNfNum = '';
    let firstDtEmissao = '';
    let firstVlrBruto: number | null = null;
    let firstVlrNF: number | null = null;

    for (const inv of invoices) {
      procTotalNF += Number(inv.docMnyValor || 0);
      const despesas = inv.encargos?.despesas || [];
      for (const d of despesas) {
        if ((d.ctpDesNome || '').toUpperCase() === 'ENCARGOS FINANCEIROS') {
          procTotalEncargos += Number(d.dppMnyValorMn || 0);
        }
      }
      if (!firstNfNum && inv.docEspNumero) {
        firstNfNum = inv.docEspNumero || String(inv.docCod || '');
        firstDtEmissao = formatDateForExport(inv.docDtaEmissao);
        firstVlrBruto = inv.mnyBruto != null ? Number(inv.mnyBruto) : null;
        firstVlrNF = inv.docMnyValor != null ? Number(inv.docMnyValor) : null;
      }
    }

    const hasInvoices = invoices.length > 0;
    const oldestEmissao: Date | null = hasInvoices
      ? invoices.reduce<Date | null>((acc, inv) => {
          if (!inv.docDtaEmissao) return acc;
          const d = new Date(inv.docDtaEmissao);
          return !isNaN(d.getTime()) && (!acc || d < acc) ? d : acc;
        }, null)
      : null;

    const sumVlrContratos = contracts.reduce(
      (s, c) => s + (c.vlrMneg != null ? Number(c.vlrMneg) : c.imcMnyValor != null ? Number(c.imcMnyValor) : 0),
      0
    );

    for (const contract of contracts) {
      const taxa = contract.imcFltTxFec != null ? Number(contract.imcFltTxFec) : (contract.imcMnyTaxa != null ? Number(contract.imcMnyTaxa) : null);
      const moeda = contract.moeEspNome || '';
      const vlrContrato = contract.vlrMneg != null ? Number(contract.vlrMneg) : (contract.imcMnyValor != null ? Number(contract.imcMnyValor) : null);
      const vlrNacional = contract.vlrMnac != null ? Number(contract.vlrMnac) : null;
      const dtFechamentoStr = formatDateForExport(contract.imcDtaFechamento);
      const dtFechamentoSerial = toExcelSerialDate(contract.imcDtaFechamento);

      let perFinmto: number | null = null;
      if (contract.imcDtaFechamento && oldestEmissao) {
        const fechamento = new Date(contract.imcDtaFechamento);
        if (!isNaN(fechamento.getTime())) {
          perFinmto = Math.ceil(
            Math.abs(fechamento.getTime() - oldestEmissao.getTime()) / (1000 * 60 * 60 * 24)
          );
        }
      }

      // Encargos rateados por valor do contrato (quando há múltiplos contratos)
      const peso = sumVlrContratos > 0 && vlrContrato != null ? vlrContrato / sumVlrContratos : (contracts.length > 0 ? 1 / contracts.length : 1);
      const encargosContrato = hasInvoices ? procTotalEncargos * peso : 0;

      let vlrEncDia: number | null = null;
      let txEncDia: number | null = null;
      let cdiDiaVal: number | null = null;
      let delta: number | null = null;

      if (hasInvoices && procTotalEncargos > 0 && perFinmto != null && perFinmto > 0) {
        vlrEncDia = encargosContrato / perFinmto;
        if (vlrNacional != null && vlrNacional > 0) {
          txEncDia = (vlrEncDia / vlrNacional) * 100;
        }
        if (cdiHistory?.length) {
          const exposureStart = oldestEmissao?.toISOString().split('T')[0] ?? '';
          const exposureEnd = contract.imcDtaFechamento ? new Date(contract.imcDtaFechamento).toISOString().split('T')[0] : '';
          if (exposureStart && exposureEnd) {
            cdiDiaVal = computeCdiForPeriod(cdiHistory, exposureStart, exposureEnd, perFinmto);
          }
        }
        if (txEncDia != null && cdiDiaVal != null) {
          delta = txEncDia - cdiDiaVal;
        }
      }

      // Colunas O–T: ocultas, vazias (uma linha por contrato)
      const colO_T = [null, null, null, null, null, null];

      // U–Y: Encargos Fin, Vlr Enc Dia, Tx Enc Dia, CDI Dia, Delta (preenchidos se há NF)
      const encargosFin = hasInvoices && encargosContrato > 0 ? encargosContrato : null;
      const vlrEncDiaVal = hasInvoices ? vlrEncDia : null;
      const txEncDiaVal = hasInvoices ? txEncDia : null;
      const cdiDiaValCell = hasInvoices ? cdiDiaVal : (cdiRef != null ? cdiRef : null); // Para sem NF: CDI ref para fórmula
      const deltaVal = hasInvoices ? delta : null;

      // Z–AB: Data Prov (vazio), Per Prov Juros (fórmula), Encargos Prov (fórmula) — só para sem NF
      // Valores iniciais; fórmulas serão aplicadas depois no createV2Sheet
      const dataProv = null; // Usuário inputa manualmente
      const perProvJuros = null; // Será fórmula
      const encargosProv = null; // Será fórmula

      const row: (string | number | null)[] = [
        filCod, priCod, ref, cliente,
        taxa, moeda, vlrContrato, vlrNacional,
        dtFechamentoSerial ?? dtFechamentoStr, // Serial para fórmulas, string como fallback
        perFinmto,
        hasInvoices ? firstNfNum : null,
        hasInvoices ? firstDtEmissao : null,
        hasInvoices ? firstVlrBruto : null,
        hasInvoices ? firstVlrNF : null,
        ...colO_T,
        encargosFin,
        vlrEncDiaVal,
        txEncDiaVal,
        cdiDiaValCell,
        deltaVal,
        dataProv,
        perProvJuros,
        encargosProv
      ];

      rows.push(row);
      processGroups.push(procIdx);
    }
  }

  return { data: [headers, ...rows], processGroups };
}

/**
 * Aba 2 — Notas Fiscais (uma linha por NF, visão tabular limpa)
 */
function buildNFsSheetData(processes: any[]): (string | number | null)[][] {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente', 'UF',
    'Nº NF', 'Tipo Documento', 'Data Emissão', 'Vlr. Bruto', 'Vlr. NF', 'Status',
    'Qtd Títulos', 'Total Títulos', 'Total Pago', 'Saldo Aberto',
    'Encargos Financeiros'
  ];

  const rows: (string | number | null)[][] = [];

  for (const proc of processes) {
    for (const inv of (proc.invoices || [])) {
      const totalTitulos = Number(inv.titlesSummary?.totalVlr || 0);
      const totalPago = Number(inv.titlesSummary?.totalVlrPago || 0);
      const saldoAberto = totalTitulos > 0 ? totalTitulos - totalPago : null;

      const despesas = inv.encargos?.despesas || [];
      let encargos = 0;
      for (const d of despesas) {
        if ((d.ctpDesNome || '').toUpperCase() === 'ENCARGOS FINANCEIROS') {
          encargos += Number(d.dppMnyValorMn || 0);
        }
      }

      const statusMap: Record<number, string> = { 1: 'Aberto', 2: 'Em Andamento', 3: 'Finalizado', 7: 'Cancelado' };

      rows.push([
        inv.filCod ?? proc.filCod ?? '',
        proc.priCod || '',
        proc.priEspRefcliente || String(proc.priCod || ''),
        inv.dpeNomPessoa || proc.dpeNomPessoa || '',
        inv.ufEspSigla || '',
        inv.docEspNumero || String(inv.docCod || ''),
        inv.tpdDesNome || '',
        formatDateForExport(inv.docDtaEmissao),
        inv.mnyBruto != null ? Number(inv.mnyBruto) : null,
        inv.docMnyValor != null ? Number(inv.docMnyValor) : null,
        statusMap[inv.vldStatus] || String(inv.vldStatus || ''),
        (inv.titles || []).length,
        totalTitulos > 0 ? totalTitulos : null,
        totalPago > 0 ? totalPago : null,
        saldoAberto,
        encargos > 0 ? encargos : null,
      ]);
    }
  }

  return [headers, ...rows];
}

/**
 * Aba 3 — Títulos (uma linha por título, com contexto da NF e processo)
 */
function buildTitulosSheetData(processes: any[]): (string | number | null)[][] {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente',
    'Nº NF', 'Vlr. NF',
    'Título', 'Parcela', 'Vencimento', 'Venc. Original',
    'Vlr. Título', 'Total Pago', 'Saldo', 'Status Pgto',
    'Juros', 'Descontos', 'Moeda'
  ];

  const rows: (string | number | null)[][] = [];

  for (const proc of processes) {
    for (const inv of (proc.invoices || [])) {
      for (const t of (inv.titles || [])) {
        const vlrTitulo = t.titMnyValor != null ? Number(t.titMnyValor) : null;
        const totalPago = t.titMnyTotPago != null ? Number(t.titMnyTotPago) : null;
        const saldo = (vlrTitulo != null && totalPago != null) ? vlrTitulo - totalPago : null;

        rows.push([
          t.filCod ?? inv.filCod ?? proc.filCod ?? '',
          proc.priCod || '',
          proc.priEspRefcliente || String(proc.priCod || ''),
          inv.dpeNomPessoa || proc.dpeNomPessoa || '',
          inv.docEspNumero || String(inv.docCod || ''),
          inv.docMnyValor != null ? Number(inv.docMnyValor) : null,
          t.titEspNumero || String(t.titCod || ''),
          t.dupEspOrdem || '',
          formatDateForExport(t.titDtaVencimento),
          formatDateForExport(t.titDtaVencOriginal),
          vlrTitulo,
          totalPago,
          saldo,
          mapPagoStatus(t.pago),
          t.gerNumJuros != null ? Number(t.gerNumJuros) : null,
          t.gerNumDesconto != null ? Number(t.gerNumDesconto) : null,
          t.moeEspNome || '',
        ]);
      }
    }
  }

  return [headers, ...rows];
}

interface V2SheetOptions {
  /** Mapa de índice de processo por linha de dados (0-based, sem header) para coloração alternada */
  processGroups?: number[];
}

const FILL_GRAY: XLSX.CellStyle['fill'] = { fgColor: { rgb: 'F2F2F2' } };
const FILL_WHITE: XLSX.CellStyle['fill'] = { fgColor: { rgb: 'FFFFFF' } };
const HEADER_STYLE: XLSX.CellStyle = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center' },
};

function createV2Sheet(
  sheetData: (string | number | null)[][],
  colWidths: number[],
  financialCols: number[],
  currencyCols: number[],
  intCols: number[],
  rateCols: number[] = [],
  opts?: V2SheetOptions
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  const fmtFinanceiro = '#,##0.00';
  const fmtReais = '"R$ "#,##0.00';
  const fmtRate = '0.000000';

  const numRows = sheetData.length;
  const numCols = sheetData[0]?.length || 0;
  const letters = Array.from({ length: numCols }, (_, i) => {
    if (i < 26) return String.fromCharCode(65 + i);
    return String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
  });

  // Estilizar header
  for (let c = 0; c < numCols; c++) {
    const ref = letters[c] + '1';
    if (ws[ref]) {
      ws[ref].s = HEADER_STYLE;
    }
  }

  for (let r = 1; r < numRows; r++) {
    // Coloração alternada por processo
    let rowFill: XLSX.CellStyle['fill'] | undefined;
    if (opts?.processGroups && opts.processGroups[r - 1] != null) {
      rowFill = opts.processGroups[r - 1] % 2 === 1 ? FILL_GRAY : FILL_WHITE;
    }

    for (let c = 0; c < numCols; c++) {
      const ref = letters[c] + (r + 1);
      if (!ws[ref]) {
        ws[ref] = { v: '', t: 's' };
      }
      if (rowFill) {
        ws[ref].s = { ...(ws[ref].s || {}), fill: rowFill };
      }
    }

    for (const ci of financialCols) {
      const cell = ws[letters[ci] + (r + 1)];
      if (cell && (typeof cell.v === 'number' || cell.t === 'n')) {
        cell.z = fmtFinanceiro;
        cell.t = 'n';
      }
    }
    for (const ci of currencyCols) {
      const cell = ws[letters[ci] + (r + 1)];
      if (cell && (typeof cell.v === 'number' || cell.t === 'n')) {
        cell.z = fmtReais;
        cell.t = 'n';
      }
    }
    for (const ci of intCols) {
      const cell = ws[letters[ci] + (r + 1)];
      if (cell && (typeof cell.v === 'number' || cell.t === 'n')) {
        cell.z = '0';
        cell.t = 'n';
      }
    }
    for (const ci of rateCols) {
      const cell = ws[letters[ci] + (r + 1)];
      if (cell && (typeof cell.v === 'number' || cell.t === 'n')) {
        cell.z = fmtRate;
        cell.t = 'n';
      }
    }
  }

  ws['!cols'] = colWidths.map(w => ({ wch: w }));
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ state: 'frozen', ySplit: 1 });

  return ws;
}

/** Retorna letra da coluna Excel (A, B, ..., Z, AA, AB, ...) */
function colLetter(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i);
  return String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
}

/**
 * Cria worksheet da aba "Visão Geral" — uma linha por contrato.
 * Oculta colunas O–T, aplica fórmulas em Per Prov Juros e Encargos Prov.
 */
function createContractSheet(
  sheetData: (string | number | null)[][],
  processGroups: number[]
): XLSX.WorkSheet {
  const colWidths = [
    8, 10, 18, 30, 12, 10, 16, 16, 14, 12, 14, 14, 16, 16,
    12, 14, 14, 14, 12, 14,  // O–T (ocultas)
    18, 16, 14, 14, 18, 14, 12, 18
  ];
  const numCols = 28;
  const ws = createV2Sheet(
    sheetData,
    colWidths,
    [4, 6],                                  // financialCols: Taxa Câmbio, Vlr Contrato (sem moeda)
    [7, 12, 13, 20, 21, 27],                 // currencyCols: Vlr Nacional, Vlr Bruto, Vlr NF, Encargos Fin, Vlr Enc Dia, Encargos Prov
    [9, 26],                                 // intCols: Per. Finmto, Per Prov Juros
    [22, 23, 24],                            // rateCols: Tx Enc Dia, CDI Dia, Delta
    { processGroups }
  );

  const numRows = sheetData.length;
  const fmtDate = 'dd/mm/yyyy';

  // Ocultar colunas O–T (índices 14–19)
  for (let c = 14; c <= 19; c++) {
    if (ws['!cols'] && ws['!cols'][c]) {
      (ws['!cols'][c] as Record<string, unknown>).hidden = true;
    }
  }

  // Formatar coluna I (Dt Fechamento) como data; coluna Z (Data Prov) para input manual
  for (let r = 1; r < numRows; r++) {
    const rowNum = r + 1;
    const cellI = ws[colLetter(8) + rowNum];
    if (cellI && (typeof cellI.v === 'number' || cellI.t === 'n')) {
      cellI.z = fmtDate;
      cellI.t = 'n';
    }
    // Coluna Z (Data Prov): garantir formato de data para quando o usuário preencher
    const zRef = colLetter(25) + rowNum;
    if (!ws[zRef]) {
      ws[zRef] = { t: 'n' as const, z: fmtDate };
    } else if (ws[zRef] && !(ws[zRef] as XLSX.CellObject).z) {
      (ws[zRef] as XLSX.CellObject).z = fmtDate;
    }
  }

  // Aplicar fórmulas em Per Prov Juros (AA) e Encargos Prov (AB)
  // Per Prov Juros: dias entre Data Prov (Z) e Dt Fechamento (I)
  // Encargos Prov: Vlr. Nacional (H) * CDI Dia (X) / 100 * Per Prov Juros (AA)
  for (let r = 1; r < numRows; r++) {
    const rowNum = r + 1;
    const zRef = colLetter(25) + rowNum;
    const iRef = colLetter(8) + rowNum;
    const hRef = colLetter(7) + rowNum;
    const xRef = colLetter(23) + rowNum;
    const aaRef = colLetter(26) + rowNum;
    const abRef = colLetter(27) + rowNum;

    // Fórmulas em en-US (padrão OOXML/XLSX). Excel/Sheets armazenam assim; pt-BR só exibe traduzido.
    ws[aaRef] = {
      t: 'n',
      f: `IF(OR(ISBLANK(${zRef}),ISBLANK(${iRef})),"",MAX(0,${zRef}-${iRef}))`,
      z: '0'
    };
    ws[abRef] = {
      t: 'n',
      f: `IF(OR(ISBLANK(${zRef}),ISBLANK(${aaRef})),"",${hRef}*(${xRef}/100)*${aaRef})`,
      z: '"R$ "#,##0.00'
    };
  }

  // Colorir cabeçalhos das colunas de simulação (Z=25, AA=26, AB=27) em laranja
  const ORANGE_HEADER: XLSX.CellStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { fgColor: { rgb: 'E07020' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  for (const ci of [25, 26, 27]) {
    const ref = colLetter(ci) + '1';
    if (ws[ref]) ws[ref].s = ORANGE_HEADER;
  }

  return ws;
}

/**
 * Cria worksheet da aba "Sem Encargos" (processos sem encargos financeiros mas com adiantamento).
 * 30 colunas = 28 originais + Adiantamento (col I) + Saldo Base (col J).
 * Linha de rodapé com "Valor a Permutar" em negrito.
 */
function createInoxSheet(
  sheetData: (string | number | null)[][],
  processGroups: number[]
): XLSX.WorkSheet {
  // 31 colunas: 28 base + 3 novas (Adiantamento Real, Adiantamento 30%, Saldo Base 70%)
  const colWidths = [
    8, 10, 18, 30, 12, 10, 16, 16,  // A–H (Filial→Vlr.Nacional)
    18, 18, 18,                       // I: Adto Real, J: Adto 30%, K: Saldo Base 70%
    14, 12, 14, 14, 16, 16,          // L–Q (Dt.Fech, Per.Finmto, NF, DtEmiss, VlrBruto, VlrNF)
    12, 14, 14, 14, 12, 14,          // R–W (O–T ocultas)
    18, 16, 14, 14, 18, 14, 12, 18  // X–AE (Encargos Fin… Encargos Prov)
  ];

  // Índices na aba Sem Encargos (deslocados +3 a partir do índice 11)
  // currencyCols: Vlr Nacional(7), Adto Real(8), Adto 30%(9), Saldo Base(10),
  //               Vlr Bruto(15), Vlr NF(16), Encargos Fin(23), Vlr Enc Dia(24), Encargos Prov(30)
  const ws = createV2Sheet(
    sheetData,
    colWidths,
    [4, 6],                                // financialCols: Taxa Câmbio, Vlr Contrato
    [7, 8, 9, 10, 15, 16, 23, 24, 30],    // currencyCols
    [12, 29],                              // intCols: Per.Finmto, Per Prov Juros
    [25, 26, 27],                          // rateCols: Tx Enc Dia, CDI Dia, Delta
    { processGroups }
  );

  const numRows = sheetData.length;
  const fmtDate = 'dd/mm/yyyy';

  // Ocultar colunas O–T (agora índices 17–22 no layout Sem Encargos)
  for (let c = 17; c <= 22; c++) {
    if (ws['!cols'] && ws['!cols'][c]) {
      (ws['!cols'][c] as Record<string, unknown>).hidden = true;
    }
  }

  // Formatar Dt Fechamento (col L = índice 11) como data
  for (let r = 1; r < numRows; r++) {
    const rowNum = r + 1;
    const cellL = ws[colLetter(11) + rowNum];
    if (cellL && (typeof cellL.v === 'number' || cellL.t === 'n')) {
      cellL.z = fmtDate;
      cellL.t = 'n';
    }
  }

  // Colorir cabeçalhos de simulação em laranja: Data Prov(28), Per Prov Juros(29), Encargos Prov(30)
  const ORANGE_HEADER: XLSX.CellStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { fgColor: { rgb: 'E07020' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  for (const ci of [28, 29, 30]) {
    const ref = colLetter(ci) + '1';
    if (ws[ref]) ws[ref].s = ORANGE_HEADER;
  }

  // Estilizar linha de rodapé ("Valor a Permutar") em negrito
  const footerRowNum = numRows + 1;
  const FOOTER_STYLE: XLSX.CellStyle = {
    font: { bold: true, sz: 10 },
    fill: { fgColor: { rgb: 'FFF3E0' } },
  };
  for (let c = 0; c < colWidths.length; c++) {
    const ref = colLetter(c) + footerRowNum;
    if (!ws[ref]) ws[ref] = { v: '', t: 's' };
    ws[ref].s = { ...(ws[ref].s || {}), ...FOOTER_STYLE };
  }

  // Soma Encargos Prov (col AE = índice 30) na linha de rodapé
  const lastDataRow = numRows;
  const aeRef = colLetter(30) + footerRowNum;
  ws[aeRef] = {
    t: 'n',
    f: `SUM(AE2:AE${lastDataRow})`,
    z: '"R$ "#,##0.00',
    s: FOOTER_STYLE,
  };

  return ws;
}

export interface CDIHistoryEntry {
  date: string;
  dailyRate: number;
}

export interface Com299Row {
  docCod: number;
  priCod: number;
  mnyBruto: number;
  mnyAcrescimo: number;
  mnyDesconto: number;
  mnyTitValor: number;
  mnyTitPago: number;
  mnyTitPermuta: number;
  mnyTitAberto: number;
  mnyTitPermutar: number;
  docDtaEmissao: string | null;
  borDtaFinalizado: string | null;
}

export interface ExportV2Params {
  processes: any[];
  /** Série histórica CDI diária do BCB (ordenada por data) */
  cdiHistory?: CDIHistoryEntry[];
  /** Data Prov no formato dd/mm/yyyy (padrão: hoje) */
  dataProv?: string;
  /** Valor a Permutar (soma mnyTitPermutar dos adiantamentos em com299) */
  valorPermutar?: number;
  /** Lista com299 para terceira página (PDF e XLSX) */
  com299List?: Com299Row[];
}

/**
 * Verifica se um processo tem encargos financeiros nos registros com017.
 * Retorna true se houver ao menos uma despesa 'ENCARGOS FINANCEIROS' com valor > 0.
 */
function processHasEncargos(proc: any): boolean {
  for (const inv of (proc.invoices || [])) {
    for (const d of (inv.encargos?.despesas || [])) {
      if ((d.ctpDesNome || '').toUpperCase() === 'ENCARGOS FINANCEIROS' && Number(d.dppMnyValorMn ?? 0) > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Separa processos em dois grupos:
 * - comEncargos: tem encargos financeiros (independente de adiantamento), OU não tem nenhum dos dois
 * - semEncargos: NÃO tem encargos financeiros MAS tem adiantamento no com299
 */
function classifyProcesses(
  processes: any[],
  com299List: Com299Row[]
): { comEncargos: any[]; semEncargos: any[] } {
  const priCodsComAdto = new Set<number>(
    com299List.map(r => r.priCod).filter(id => id > 0)
  );

  const comEncargos: any[] = [];
  const semEncargos: any[] = [];

  for (const proc of processes) {
    const hasEncargos = processHasEncargos(proc);
    const hasAdiantamento = priCodsComAdto.has(Number(proc.priCod));

    if (!hasEncargos && hasAdiantamento) {
      semEncargos.push(proc);
    } else {
      comEncargos.push(proc);
    }
  }

  return { comEncargos, semEncargos };
}

/**
 * Vincula registros com299 de um processo aos seus contratos.
 * - 1 contrato: vínculo direto
 * - N contratos: match por proximidade de valor (adiantamento ≈ 10–30% do vlrMneg)
 * - Fallback: primeiro contrato
 *
 * Retorna Map<índice do contrato, Com299Row[]>
 */
function matchAdiantamentoToContract(
  adtos: Com299Row[],
  contracts: any[]
): Map<number, Com299Row[]> {
  const result = new Map<number, Com299Row[]>();
  if (contracts.length === 0) return result;

  if (contracts.length === 1) {
    result.set(0, adtos);
    return result;
  }

  for (const adto of adtos) {
    const adtoVal = adto.mnyTitValor;
    let bestIdx = 0;
    let bestDiff = Infinity;

    for (let i = 0; i < contracts.length; i++) {
      const vlrMneg = Number(contracts[i].vlrMneg ?? contracts[i].imcMnyValor ?? 0);
      const diff = Math.min(
        Math.abs(adtoVal - vlrMneg * 0.10),
        Math.abs(adtoVal - vlrMneg * 0.30)
      );
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    if (!result.has(bestIdx)) result.set(bestIdx, []);
    result.get(bestIdx)!.push(adto);
  }

  return result;
}

/** Retorna data de hoje em dd/mm/yyyy */
function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

/**
 * Constrói a aba "Sem Encargos": processos sem encargos financeiros mas com adiantamento.
 * Baseada no layout da Visão Geral + 3 colunas extras após Vlr. Nacional (col H):
 *
 * Layout de colunas (31 total):
 *   0–7:  A–H (Filial → Vlr.Nacional)
 *   8:    Adiantamento (Real) — valor real do com299 vinculado ao contrato
 *   9:    Adiantamento (30%) — VlrNac × 0.3 (referência calculada)
 *   10:   Saldo Base (70%)  — VlrNac × 0.7
 *   11–30: demais colunas (Dt.Fechamento → Encargos Prov)
 */
function buildSemEncargosSheetData(
  processes: any[],
  com299List: Com299Row[],
  valorPermutar: number,
  cdiHistory?: CDIHistoryEntry[]
): HierarchicalSheetResult {
  // Agrupamento de adiantamentos por priCod
  const adtoByPriCod = new Map<number, Com299Row[]>();
  for (const row of com299List) {
    if (!row.priCod) continue;
    if (!adtoByPriCod.has(row.priCod)) adtoByPriCod.set(row.priCod, []);
    adtoByPriCod.get(row.priCod)!.push(row);
  }

  // Reutiliza o builder padrão para obter as linhas base (28 colunas)
  const { data: base, processGroups } = buildContractSheetData(processes, cdiHistory);
  const baseHeaders = base[0] as string[];
  const baseRows = base.slice(1) as (string | number | null)[][];

  // Inserir cabeçalhos após Vlr. Nacional (índice 7)
  const headers: string[] = [
    ...baseHeaders.slice(0, 8),     // A–H
    'Adiantamento (Real)',           // col I (8)
    'Adiantamento (30%)',            // col J (9)
    'Saldo Base (70%)',              // col K (10)
    ...baseHeaders.slice(8),        // L… (desloca originais)
  ];

  // Mapa de contrato-index → soma de adiantamentos reais (para preencher por linha)
  // A cada processo, precisa saber o índice relativo de cada contrato
  let rowIdx = 0;
  const adtoRealByRowIdx = new Map<number, number | null>();

  for (const proc of processes) {
    const contracts = proc.contracts || [];
    const priCod = Number(proc.priCod);
    const adtos = adtoByPriCod.get(priCod) || [];
    const contractAdtoMap = matchAdiantamentoToContract(adtos, contracts);

    for (let ci = 0; ci < contracts.length; ci++) {
      const linked = contractAdtoMap.get(ci) || [];
      const realVal = linked.length > 0
        ? linked.reduce((s, r) => s + r.mnyTitValor, 0)
        : null;
      adtoRealByRowIdx.set(rowIdx, realVal);
      rowIdx++;
    }
  }

  const rows: (string | number | null)[][] = baseRows.map((row, idx) => {
    const vlrNacional = typeof row[7] === 'number' ? row[7] : null;
    const adtoReal = adtoRealByRowIdx.get(idx) ?? null;
    const adto30 = vlrNacional != null ? vlrNacional * 0.3 : null;
    const saldoBase = vlrNacional != null ? vlrNacional * 0.7 : null;
    return [
      ...row.slice(0, 8),
      adtoReal,
      adto30,
      saldoBase,
      ...row.slice(8),
    ];
  });

  // Linha de rodapé: "Valor a Permutar" na col Adiantamento (Real) (índice 8)
  const footerRow: (string | number | null)[] = new Array(headers.length).fill(null);
  footerRow[0] = 'Valor a Permutar';
  footerRow[8] = valorPermutar;
  rows.push(footerRow);

  return { data: [headers, ...rows], processGroups: [...processGroups, -1] };
}

/**
 * Constrói dados da aba com299 — uma linha por docCod + linha de somatório
 */
function buildCom299SheetData(com299List: Com299Row[]): (string | number | null)[][] {
  const headers = [
    'docCod',
    'priCod',
    'Dt. Emissão',
    'Dt. Baixa',
    'Valor Total',
    'Valor Acresc',
    'Valor Desc',
    'Valor Titulo',
    'Valor Pago',
    'Valor Permutado',
    'Valor em Aberto',
    'Valor a Perm',
  ];
  const rows: (string | number | null)[][] = com299List.map((r) => [
    r.docCod,
    r.priCod,
    formatDateForExport(r.docDtaEmissao),
    formatDateForExport(r.borDtaFinalizado),
    r.mnyBruto,
    r.mnyAcrescimo,
    r.mnyDesconto,
    r.mnyTitValor,
    r.mnyTitPago,
    r.mnyTitPermuta,
    r.mnyTitAberto,
    r.mnyTitPermutar,
  ]);
  if (rows.length > 0) {
    const sumRow: (string | number | null)[] = [
      'TOTAL', '', '', '',
      com299List.reduce((s, r) => s + r.mnyBruto, 0),
      com299List.reduce((s, r) => s + r.mnyAcrescimo, 0),
      com299List.reduce((s, r) => s + r.mnyDesconto, 0),
      com299List.reduce((s, r) => s + r.mnyTitValor, 0),
      com299List.reduce((s, r) => s + r.mnyTitPago, 0),
      com299List.reduce((s, r) => s + r.mnyTitPermuta, 0),
      com299List.reduce((s, r) => s + r.mnyTitAberto, 0),
      com299List.reduce((s, r) => s + r.mnyTitPermutar, 0),
    ];
    rows.push(sumRow);
  }
  return [headers, ...rows];
}

/**
 * Cria worksheet da aba com299
 */
function createCom299Sheet(sheetData: (string | number | null)[][]): XLSX.WorkSheet {
  const colWidths = [12, 12, 14, 14, 16, 16, 16, 16, 16, 16, 16, 16];
  const ws = createV2Sheet(
    sheetData,
    colWidths,
    [],
    [4, 5, 6, 7, 8, 9, 10, 11],
    [0, 1],
    []
  );
  const numRows = sheetData.length;
  const fmtReais = '"R$ "#,##0.00';
  // 12 colunas: A=docCod, B=priCod, C=Dt.Emissão, D=Dt.Baixa, E..L = valores monetários
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const FOOTER_STYLE: XLSX.CellStyle = { font: { bold: true }, fill: { fgColor: { rgb: 'FFF3E0' } } };
  for (let r = 1; r < numRows; r++) {
    for (let c = 4; c <= 11; c++) {
      const cell = ws[colLetters[c] + (r + 1)];
      if (cell && (typeof cell.v === 'number' || cell.t === 'n')) {
        cell.z = fmtReais;
        cell.t = 'n';
      }
    }
    if (r === numRows - 1) {
      for (let c = 0; c < 12; c++) {
        const ref = colLetters[c] + (r + 1);
        if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), ...FOOTER_STYLE };
      }
    }
  }
  return ws;
}

/**
 * Aba "Exposição Cambial" — uma linha por duplicata FOB de cada título de cada NF.
 * Mostra o valor FOB real que deve ser usado como saldo base da exposição cambial,
 * em vez do valor total do contrato de câmbio.
 */
function buildExposicaoCambialSheetData(processes: any[]): (string | number | null)[][] {
  const headers = [
    'Filial', 'Código', 'Referência', 'Cliente',
    'Taxa Câmbio', 'Moeda', 'Vlr. Contrato',
    'Nº NF', 'Data Emissão', 'Vlr. NF',
    'Título', 'Parcela', 'Vencimento', 'Vlr. Título', 'Status Pgto', 'Data Baixa',
    'Composição (impDesNome)', 'impCod', 'Vlr. Duplicata (FOB)', 'Ação (ftdVldAcao)',
  ];

  const rows: (string | number | null)[][] = [];

  for (const proc of processes) {
    const filCod = proc.filCod ?? '';
    const priCod = proc.priCod || '';
    const ref = proc.priEspRefcliente || String(proc.priCod || '');
    const cliente = proc.dpeNomPessoa || '';
    const contract = proc.contracts?.[0];
    const taxa = contract?.imcFltTxFec != null ? Number(contract.imcFltTxFec) : (contract?.imcMnyTaxa != null ? Number(contract.imcMnyTaxa) : null);
    const moeda = contract?.moeEspNome || '';
    const vlrContrato = contract?.vlrMneg != null ? Number(contract.vlrMneg) : (contract?.imcMnyValor != null ? Number(contract.imcMnyValor) : null);

    for (const inv of (proc.invoices || [])) {
      const nfNum = inv.docEspNumero || String(inv.docCod || '');
      const dtEmissao = formatDateForExport(inv.docDtaEmissao);
      const vlrNF = inv.docMnyValor != null ? Number(inv.docMnyValor) : null;

      for (const title of (inv.titles || [])) {
        const duplicatas = title.duplicatas || [];
        const fobEntries = duplicatas.filter((d: any) =>
          (d.impDesNome || '').toUpperCase() === 'FOB' && d.ftdVldAcao === 1
        );

        if (fobEntries.length === 0) continue;

        for (const dup of fobEntries) {
          rows.push([
            filCod, priCod, ref, cliente,
            taxa, moeda, vlrContrato,
            nfNum, dtEmissao, vlrNF,
            title.titEspNumero || String(title.titCod || ''),
            title.dupEspOrdem || '',
            formatDateForExport(title.titDtaVencimento),
            title.titMnyValor != null ? Number(title.titMnyValor) : null,
            mapPagoStatus(title.pago),
            formatDateForExport(title.borDtaMvto),
            dup.impDesNome || '',
            dup.impCod ?? null,
            dup.ftdMnyValor != null ? Number(dup.ftdMnyValor) : null,
            dup.ftdVldAcao ?? null,
          ]);
        }
      }
    }
  }

  return [headers, ...rows];
}

export function exportDelaysXLSXV2({ processes, cdiHistory, valorPermutar = 0, com299List = [] }: ExportV2Params): void {
  const wb = XLSX.utils.book_new();

  // Classificar processos: com encargos (ou sem nada) → Visão Geral; sem encargos mas com adiantamento → Sem Encargos
  const { comEncargos, semEncargos } = classifyProcesses(processes, com299List);

  // Aba 1: Visão Geral (processos com encargos + sem encargos e sem adiantamento)
  const { data: contractData, processGroups } = buildContractSheetData(comEncargos, cdiHistory);
  const wsHier = createContractSheet(contractData, processGroups);
  XLSX.utils.book_append_sheet(wb, wsHier, 'Visão Geral');

  // Aba 2: Notas Fiscais (todos os processos)
  const nfData = buildNFsSheetData(processes);
  const wsNF = createV2Sheet(
    nfData,
    [8, 10, 18, 30, 6, 14, 24, 14, 16, 16, 14, 12, 16, 16, 16, 18],
    [],
    [8, 9, 12, 13, 14, 15],
    [11]
  );
  XLSX.utils.book_append_sheet(wb, wsNF, 'Notas Fiscais');

  // Aba 3: Títulos (todos os processos)
  const titData = buildTitulosSheetData(processes);
  const wsTit = createV2Sheet(
    titData,
    [8, 10, 18, 30, 14, 16, 14, 8, 14, 14, 16, 16, 16, 14, 14, 14, 10],
    [14, 15],
    [5, 10, 11, 12],
    []
  );
  XLSX.utils.book_append_sheet(wb, wsTit, 'Títulos');

  // Aba 4: Sem Encargos (processos sem encargos financeiros mas com adiantamento)
  if (semEncargos.length > 0) {
    const { data: semData, processGroups: semGroups } = buildSemEncargosSheetData(semEncargos, com299List, valorPermutar, cdiHistory);
    const wsSem = createInoxSheet(semData, semGroups);
    XLSX.utils.book_append_sheet(wb, wsSem, 'Sem Encargos');
  }

  // Aba 5: Exposição Cambial (FOB) — saldo base real por título/duplicata
  const exposicaoData = buildExposicaoCambialSheetData(processes);
  if (exposicaoData.length > 1) {
    const wsExposicao = createV2Sheet(
      exposicaoData,
      [8, 10, 18, 28, 12, 10, 16, 14, 14, 16, 14, 8, 14, 16, 12, 14, 22, 10, 18, 10],
      [4],                            // financialCols: Taxa Câmbio
      [6, 9, 13, 18],                 // currencyCols: Vlr Contrato, Vlr NF, Vlr Título, Vlr Duplicata FOB
      [17, 19],                        // intCols: impCod, Ação
    );
    XLSX.utils.book_append_sheet(wb, wsExposicao, 'Exposição Cambial');
  }

  // Aba 6: com299 (todos os adiantamentos)
  if (com299List.length > 0) {
    const com299Data = buildCom299SheetData(com299List);
    const wsCom299 = createCom299Sheet(com299Data);
    XLSX.utils.book_append_sheet(wb, wsCom299, 'com299');
  }

  const filename = `relatorio-nfs_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}


// ═══════════════════════════════════════════════════════════════
// PDF export
// ═══════════════════════════════════════════════════════════════

function parseDateDDMMYYYY(s: string): Date | null {
  if (!s) return null;
  const p = s.split('/');
  if (p.length !== 3) return null;
  const d = parseInt(p[0], 10), m = parseInt(p[1], 10), y = parseInt(p[2], 10);
  return isNaN(d + m + y) ? null : new Date(y, m - 1, d);
}

function excelSerialToDDMMYYYY(serial: number): string {
  const d = new Date(new Date(1899, 11, 30).getTime() + serial * 86400000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

type PdfColFmt = 'text' | 'brl' | 'num2' | 'num4' | 'num6' | 'int' | 'dateSerial';

/** Arredonda número para no máximo 5 casas decimais (evita valores infinitos ou muito longos) */
function roundToMax5Decimals(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n * 100000) / 100000;
  return rounded;
}

function fmtPdfCell(v: string | number | null, fmt: PdfColFmt): string {
  if (v == null || v === '') return '';
  if (typeof v !== 'number') return String(v);
  const n = roundToMax5Decimals(v);
  switch (fmt) {
    case 'brl':        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
    case 'num2':       return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    case 'num4':       return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
    case 'num6':       return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(n);
    case 'int':        return String(Math.round(n));
    case 'dateSerial': return excelSerialToDDMMYYYY(n);
    default:           return String(v);
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPdfTable(
  headers: string[],
  rows: (string | number | null)[][],
  fmts: PdfColFmt[],
  colIndices?: number[],
  processGrps?: number[],
  opts?: { orangeOriginalIndices?: number[]; footerRows?: number; colWidths?: number[] }
): string {
  const vis = colIndices ?? headers.map((_, i) => i);
  const visHdrs = vis.map(i => headers[i]);
  const visFmts = vis.map(i => fmts[i] ?? 'text');

  // Mapear índices originais que devem ter cabeçalho laranja para posições visíveis
  const orangeVisSet = new Set<number>();
  if (opts?.orangeOriginalIndices) {
    vis.forEach((origI, vi) => {
      if (opts.orangeOriginalIndices!.includes(origI)) orangeVisSet.add(vi);
    });
  }

  const colgroup = opts?.colWidths && opts.colWidths.length >= vis.length
    ? `<colgroup>${vis.map((_, vi) => `<col style="width:${opts!.colWidths![vi]}mm">`).join('')}</colgroup>`
    : '';

  const thead = `<thead><tr>${visHdrs.map((h, vi) =>
    `<th${orangeVisSet.has(vi) ? ' class="sim-hdr"' : ''}>${escHtml(h)}</th>`
  ).join('')}</tr></thead>`;

  const footerCount = opts?.footerRows ?? 0;
  const tbody = rows.map((row, ri) => {
    const isFooter = footerCount > 0 && ri >= rows.length - footerCount;
    const isGray = !isFooter && (processGrps ? processGrps[ri] % 2 === 1 : ri % 2 === 1);
    const cells = vis.map((colI, vi) => {
      const v = row[colI] as string | number | null;
      const fmt = visFmts[vi];
      const txt = fmtPdfCell(v, fmt);
      const rightAlign = fmt !== 'text' && fmt !== 'dateSerial';
      return `<td${rightAlign ? ' class="num"' : ''}>${escHtml(txt)}</td>`;
    }).join('');
    const cls = isFooter ? 'footer-row' : isGray ? 'gray' : '';
    return `<tr${cls ? ` class="${cls}"` : ''}>${cells}</tr>`;
  }).join('');

  return `<table>${colgroup}${thead}<tbody>${tbody}</tbody></table>`;
}

/** Larguras de coluna (mm) para Visão Geral PDF — colunas compactas */
const PDF_COL_WIDTHS_GERAL = [6, 8, 12, 22, 8, 8, 12, 12, 10, 8, 10, 10, 10, 10, 12, 10, 8, 8, 8, 10, 8, 12];

/**
 * Enriquece linhas de contrato com Data Prov, Per Prov Juros e Encargos Prov.
 */
function enrichContractRowsWithDataProv(
  rows: (string | number | null)[][],
  dataProvStr: string
): (string | number | null)[][] {
  const dataProvDate = parseDateDDMMYYYY(dataProvStr);
  return rows.map(row => {
    const r = [...row];
    const dtFech = r[8];
    let fechDate: Date | null = null;
    if (typeof dtFech === 'number') {
      fechDate = new Date(new Date(1899, 11, 30).getTime() + dtFech * 86400000);
    } else if (typeof dtFech === 'string' && dtFech) {
      fechDate = parseDateDDMMYYYY(dtFech);
    }
    r[25] = dataProvStr;
    let perProv: number | null = null;
    if (fechDate && dataProvDate) {
      const days = Math.ceil((dataProvDate.getTime() - fechDate.getTime()) / 86400000);
      perProv = days > 0 ? days : 0;
    }
    r[26] = perProv;
    const vlrNac = typeof r[7] === 'number' ? r[7] : null;
    const cdiDia = typeof r[23] === 'number' ? r[23] : null;
    if (vlrNac != null && cdiDia != null && perProv != null && perProv > 0) {
      r[27] = vlrNac * (cdiDia / 100) * perProv;
    }
    return r;
  });
}

/**
 * Enriquece linhas INOX (30 colunas) com Data Prov, Per Prov Juros e Encargos Prov.
 * Índices de simulação: 27 (Data Prov), 28 (Per Prov Juros), 29 (Encargos Prov).
 */
function enrichInoxRowsWithDataProv(
  rows: (string | number | null)[][],
  dataProvStr: string
): (string | number | null)[][] {
  const dataProvDate = parseDateDDMMYYYY(dataProvStr);
  return rows.map(row => {
    const r = [...row];
    const dtFech = r[11]; // Dt. Fechamento no layout Sem Encargos (índice 11, deslocado +3)
    let fechDate: Date | null = null;
    if (typeof dtFech === 'number') {
      fechDate = new Date(new Date(1899, 11, 30).getTime() + dtFech * 86400000);
    } else if (typeof dtFech === 'string' && dtFech) {
      fechDate = parseDateDDMMYYYY(dtFech);
    }
    r[28] = dataProvStr; // Data Prov (índice 28)
    let perProv: number | null = null;
    if (fechDate && dataProvDate) {
      const days = Math.ceil((dataProvDate.getTime() - fechDate.getTime()) / 86400000);
      perProv = days > 0 ? days : 0;
    }
    r[29] = perProv; // Per Prov Juros (índice 29)
    const vlrNac = typeof r[7] === 'number' ? r[7] : null;
    const cdiDia = typeof r[26] === 'number' ? r[26] : null; // CDI Dia (índice 26)
    if (vlrNac != null && cdiDia != null && perProv != null && perProv > 0) {
      r[30] = vlrNac * (cdiDia / 100) * perProv; // Encargos Prov (índice 30)
    }
    return r;
  });
}

/**
 * V2 PDF: Gera relatório em PDF com Visão Geral (e Sem Encargos se houver processos sem encargos mas com adiantamento).
 * Data Prov vem do parâmetro (date picker). Per Prov Juros e Encargos Prov calculados automaticamente.
 */
export function exportDelaysV2PDF({ processes, cdiHistory, dataProv, valorPermutar = 0, com299List = [] }: ExportV2Params): void {
  const dataProvStr = dataProv ?? todayDDMMYYYY();

  const { comEncargos, semEncargos } = classifyProcesses(processes, com299List);

  const { data: contractData, processGroups } = buildContractSheetData(comEncargos, cdiHistory);
  const contractHeaders = contractData[0] as string[];
  const contractRows = contractData.slice(1) as (string | number | null)[][];
  const enrichedRows = enrichContractRowsWithDataProv(contractRows, dataProvStr);

  const cVis = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20, 21, 22, 23, 24, 25, 26, 27];
  const cFmts: PdfColFmt[] = [
    'text', 'text', 'text', 'text', 'num4', 'text', 'num2', 'brl',
    'dateSerial', 'int', 'text', 'text', 'brl', 'brl',
    'text', 'text', 'text', 'text', 'text', 'text',
    'brl', 'brl', 'num6', 'num6', 'num6', 'text', 'int', 'brl',
  ];

  const geralHtml = buildPdfTable(contractHeaders, enrichedRows, cFmts, cVis, processGroups, {
    orangeOriginalIndices: [25, 26, 27],
    colWidths: PDF_COL_WIDTHS_GERAL,
  });

  let semEncargosHtml = '';
  if (semEncargos.length > 0) {
    const { data: semData, processGroups: semGroups } = buildSemEncargosSheetData(semEncargos, com299List, valorPermutar, cdiHistory);
    const semHeaders = semData[0] as string[];
    const semAllRows = semData.slice(1) as (string | number | null)[][];
    const footerRow = semAllRows[semAllRows.length - 1];
    const semDataRows = semAllRows.slice(0, -1);
    const enrichedSemRows = enrichInoxRowsWithDataProv(semDataRows, dataProvStr);
    const sumEncargosProv = enrichedSemRows.reduce((s, r) => s + (typeof r[30] === 'number' ? r[30] : 0), 0);
    const footerWithSums = [...footerRow];
    footerWithSums[30] = sumEncargosProv;
    const semRowsWithFooter = [...enrichedSemRows, footerWithSums];

    // Visão Geral: colunas 0-7, 8 (Adto Real), 9 (Adto 30%), 10 (Saldo Base), 11-16 (Dt.Fech→VlrNF), 23-30 (Encargos→Prov)
    const semVis = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30];
    // fmts indexada por posição original (31 entradas)
    const semFmts: PdfColFmt[] = [
      'text', 'text', 'text', 'text', 'num4', 'text', 'num2', 'brl',  // 0-7
      'brl', 'brl', 'brl',                                               // 8-10 (Adto Real, Adto 30%, Saldo Base)
      'dateSerial', 'int', 'text', 'text', 'brl', 'brl',                // 11-16 (Dt.Fech → VlrNF)
      'text', 'text', 'text', 'text', 'text', 'text',                    // 17-22 (ocultas)
      'brl', 'brl', 'num6', 'num6', 'num6', 'text', 'int', 'brl',       // 23-30 (Encargos Fin → Encargos Prov)
    ];
    const semColWidths = [6, 8, 12, 22, 8, 8, 12, 12, 12, 12, 12, 10, 8, 10, 10, 10, 10, 12, 10, 8, 8, 8, 10, 8, 12];

    semEncargosHtml = buildPdfTable(semHeaders, semRowsWithFooter, semFmts, semVis, semGroups, {
      orangeOriginalIndices: [28, 29, 30],
      footerRows: 1,
      colWidths: semColWidths,
    });
  }

  let com299Html = '';
  if (com299List.length > 0) {
    const com299Headers = ['docCod', 'priCod', 'Dt. Emissão', 'Dt. Baixa', 'Valor Total', 'Valor Acresc', 'Valor Desc', 'Valor Titulo', 'Valor Pago', 'Valor Permutado', 'Valor em Aberto', 'Valor a Perm'];
    const com299Rows: (string | number | null)[][] = com299List.map((r) => [
      r.docCod, r.priCod, formatDateForExport(r.docDtaEmissao), formatDateForExport(r.borDtaFinalizado), r.mnyBruto, r.mnyAcrescimo, r.mnyDesconto, r.mnyTitValor, r.mnyTitPago, r.mnyTitPermuta, r.mnyTitAberto, r.mnyTitPermutar,
    ]);
    const sumRow: (string | number | null)[] = [
      'TOTAL', '', '', '',
      com299List.reduce((s, r) => s + r.mnyBruto, 0),
      com299List.reduce((s, r) => s + r.mnyAcrescimo, 0),
      com299List.reduce((s, r) => s + r.mnyDesconto, 0),
      com299List.reduce((s, r) => s + r.mnyTitValor, 0),
      com299List.reduce((s, r) => s + r.mnyTitPago, 0),
      com299List.reduce((s, r) => s + r.mnyTitPermuta, 0),
      com299List.reduce((s, r) => s + r.mnyTitAberto, 0),
      com299List.reduce((s, r) => s + r.mnyTitPermutar, 0),
    ];
    com299Rows.push(sumRow);
    const com299Fmts: PdfColFmt[] = ['int', 'int', 'text', 'text', 'brl', 'brl', 'brl', 'brl', 'brl', 'brl', 'brl', 'brl'];
    const com299ColWidths = [12, 12, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14];
    com299Html = buildPdfTable(com299Headers, com299Rows, com299Fmts, undefined, undefined, {
      footerRows: 1,
      colWidths: com299ColWidths,
    });
  }

  // Exposição Cambial (FOB) — saldo base real por duplicata
  const exposicaoSheetData = buildExposicaoCambialSheetData(processes);
  const exposicaoHeaders = exposicaoSheetData[0] as string[];
  const exposicaoRows = exposicaoSheetData.slice(1) as (string | number | null)[][];
  let exposicaoHtml = '';
  if (exposicaoRows.length > 0) {
    // Colunas visíveis no PDF (compactas): excluir impCod (17) e Ação (19)
    const expVis = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18];
    const expFmts: PdfColFmt[] = [
      'text', 'text', 'text', 'text',  // 0-3 Filial→Cliente
      'num4', 'text', 'brl',            // 4-6 Taxa, Moeda, Vlr Contrato
      'text', 'text', 'brl',            // 7-9 NF, DtEmissão, VlrNF
      'text', 'text', 'text', 'brl', 'text', 'text',  // 10-15 Título→DtBaixa
      'text', 'int', 'brl', 'int',      // 16-19 Composição, impCod, VlrFOB, Ação
    ];
    const expColWidths = [6, 8, 12, 22, 8, 14, 10, 10, 14, 14, 10, 14, 10, 12, 22, 16];

    // Somatório da coluna FOB
    const totalFOB = exposicaoRows.reduce((s, r) => s + (typeof r[18] === 'number' ? r[18] : 0), 0);
    const footerRow: (string | number | null)[] = new Array(exposicaoHeaders.length).fill(null);
    footerRow[0] = 'TOTAL FOB';
    footerRow[18] = totalFOB;
    const exposicaoRowsWithFooter = [...exposicaoRows, footerRow];

    exposicaoHtml = buildPdfTable(exposicaoHeaders, exposicaoRowsWithFooter, expFmts, expVis, undefined, {
      footerRows: 1,
      colWidths: expColWidths,
    });
  }

  const emitidoEm = new Date().toLocaleDateString('pt-BR');
  const totalProcessos = processes.length;
  const totalContratos = enrichedRows.length;
  const totalSemEnc = semEncargos.reduce((s, p) => s + (p.contracts?.length ?? 0), 0);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Encargos Financeiros — Columbia Trading</title>
<style>
@page { size: A4 landscape; margin: 12mm 10mm; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Calibri, Arial, sans-serif; font-size: 7.5pt; color: #1a1a1a; background: #fff; }

.hdr { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #4472C4; padding-bottom: 8px; margin-bottom: 16px; }
.hdr-title { font-size: 13pt; font-weight: 700; color: #4472C4; }
.hdr-sub { font-size: 8pt; color: #555; margin-top: 3px; }
.hdr-right { text-align: right; font-size: 7.5pt; color: #555; line-height: 1.8; }

.sec { margin-bottom: 20px; }
.sec-bar { display: flex; justify-content: space-between; align-items: center; background: #4472C4; color: #fff; padding: 3.5px 8px; font-weight: 700; font-size: 8pt; }
.sec-bar .cnt { font-weight: 400; opacity: .85; font-size: 7.5pt; }

table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead th { background: #4472C4; color: #fff; font-weight: 700; padding: 3px 4px; border: 1px solid #305fa0; text-align: center; font-size: 7pt; word-wrap: break-word; }
thead th.sim-hdr { background: #E07020 !important; color: #fff; }
tbody td { padding: 2px 4px; border: 1px solid #dedede; font-size: 6.5pt; word-wrap: break-word; overflow-wrap: break-word; }
tbody tr.gray td { background: #F3F3F3; }
tbody tr:not(.gray) td { background: #fff; }
tbody tr.footer-row td { background: #FFF3E0; font-weight: 700; }
.num { text-align: right; font-variant-numeric: tabular-nums; }

.pb { page-break-before: always; }
.btn-pdf { position: fixed; top: 14px; right: 14px; z-index: 9999; background: #4472C4; color: #fff; border: none; cursor: pointer; padding: 7px 18px; font-size: 9pt; font-weight: 700; font-family: inherit; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
.btn-pdf:hover { background: #2c5ca0; }

@media print {
  .btn-pdf { display: none; }
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
</style>
</head>
<body>

<button class="btn-pdf" onclick="window.print()">Salvar como PDF</button>

<div class="hdr">
  <div>
    <div class="hdr-title">Columbia Trading — Encargos Financeiros</div>
    <div class="hdr-sub">Data Prov: <strong>${dataProvStr}</strong>&nbsp;&nbsp;·&nbsp;&nbsp;Emitido em ${emitidoEm}&nbsp;&nbsp;·&nbsp;&nbsp;${totalProcessos} processos</div>
  </div>
  <div class="hdr-right">
    <div>${totalContratos} Contratos (Visão Geral)</div>
    ${semEncargos.length > 0 ? `<div>${totalSemEnc} Contratos Sem Encargos</div>` : ''}
  </div>
</div>

<div class="sec">
  <div class="sec-bar"><span>Visão Geral — por Contrato</span><span class="cnt">${totalContratos} registros</span></div>
  ${geralHtml}
</div>
${semEncargos.length > 0 ? `
<div class="sec pb">
  <div class="sec-bar"><span>Sem Encargos — com Adiantamento</span><span class="cnt">${totalSemEnc} registros</span></div>
  ${semEncargosHtml}
</div>
` : ''}
${com299Html ? `
<div class="sec pb">
  <div class="sec-bar"><span>com299 — Adiantamentos</span><span class="cnt">${com299List.length} registros</span></div>
  ${com299Html}
</div>
` : ''}
${exposicaoHtml ? `
<div class="sec pb">
  <div class="sec-bar"><span>Exposição Cambial — Saldo Base FOB por Título</span><span class="cnt">${exposicaoRows.length} registros</span></div>
  ${exposicaoHtml}
</div>
` : ''}

</body>
</html>`;

  const win = window.open('', '_blank', 'width=1280,height=900');
  if (!win) {
    alert('Pop-up bloqueado. Permita pop-ups para esta página e tente novamente.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}
