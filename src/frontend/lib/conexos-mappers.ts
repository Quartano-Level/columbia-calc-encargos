// Helpers to map Conexos responses (imp059, log009 parcelas, imp021 despesas, psq015 baixas) into canonical shapes

export function mapImp059ToProcess(raw: any) {
  // raw: { rows: [ { imcCod, imcDtaFechamento, imcFltTxFec, vlrMneg, ... } ] }
  const rows = raw?.rows || raw?.body?.rows || raw?.rows || [];
  const first = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!first) return null;
  return {
    id: first.imcCod || first.id,
    numero_processo: first.imcNumNumero || null,
    data_fechamento: first.imcDtaFechamento ? new Date(first.imcDtaFechamento).toISOString().split('T')[0] : null,
    txFec: Number(first.imcFltTxFec || 0),
    vlrMneg: Number(first.vlrMneg || 0),
    vlrMnac: Number(first.vlrMnac || 0),
    filCod: first.filCod || null,
    raw: first
  };
}

export function mapLog009ParcelasToPayments(raw: any) {
  // raw.rows => parcelas list
  const rows = raw?.rows || raw?.body?.rows || raw || [];
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.pipCod || r.id || `${r.pipDtaVcto}-${r.pipMnyValor}`,
    dueDate: r.pipDtaVcto ? new Date(r.pipDtaVcto).toISOString().split('T')[0] : null,
    value: Number(r.pipMnyValor || r.pipMnyValor || r.pipMnyValormn || 0),
    paid: Number(r.totalPago || 0) > 0,
    days: Number(r.pipNumDiasVcto || r.pipVldDias || 0),
    reference: r.pipNumOpCambio || r.pipNumParcelas || null,
    raw: r
  }));
}

export function mapImp021Despesas(raw: any) {
  // raw is object with pidMnyValorMneg
  const rows = raw?.rows || raw || [];
  const first = Array.isArray(rows) && rows.length ? rows[0] : rows;
  if (!first) return null;
  return {
    id: first.pidCodSeq || first.pidCod || null,
    descricao: first.impDesNome || first.ctpDesNome || null,
    value: Number(first.pidMnyValormn || first.pidMnyValorMneg || 0),
    raw: first
  };
}

export function mapPsq015Baixas(raw: any) {
  const rows = raw?.rows || raw || [];
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id || r.baixaId || null,
    reference: r.numero || r.ref || null,
    value: Number(r.vlr || r.vlrPago || 0),
    date: r.data ? new Date(r.data).toISOString().split('T')[0] : null,
    raw: r
  }));
}
