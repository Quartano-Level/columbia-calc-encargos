/**
 * Configurações operacionais do sistema, externalizadas via variáveis de ambiente.
 * Valores padrão correspondem à instalação Columbia Trading (filial 2).
 */

function parseCalcBase(raw: string | undefined): 360 | 252 {
  const n = Number(raw ?? '360');
  return n === 252 ? 252 : 360;
}

export const config = {
  conexos: {
    /** Código da filial (cnx-filcod / filCod). Padrão: 2 (Columbia Trading) */
    filCod: Number(process.env.CONEXOS_FIL_COD ?? '2'),
    /** Código do importador (impCod). Padrão: 1081 */
    impCod: Number(process.env.CONEXOS_IMP_COD ?? '1081'),
    /** Código do centro de custo / conta (ctpCod). Padrão: 672 (Encargos Financeiros) */
    ctpCod: Number(process.env.CONEXOS_CTP_COD ?? '672'),
    /** Código do usuário (cnx-usncod). Padrão: '97' */
    usnCod: process.env.CONEXOS_USN_COD ?? '97',
  },
  /** Base de dias para conversão de taxa anual → diária. 360 = dias corridos, 252 = dias úteis. */
  calcBase: parseCalcBase(process.env.CALC_BASE_DIAS),
} as const;
