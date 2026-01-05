import { mapImp059ToProcess, mapLog009ParcelasToPayments, mapImp021Despesas, mapPsq015Baixas } from '../conexos-mappers';

describe('conexos mappers', () => {
  test('map imp059 process', () => {
    const raw = { rows: [{ imcCod: 55, imcNumNumero: 'TEST 81', imcFltTxFec: 5.5, vlrMneg: 50000, vlrMnac: 287015, imcDtaFechamento: 1766102400000 }] };
    const res = mapImp059ToProcess(raw);
    expect(res).not.toBeNull();
    expect(res!.id).toBe(55);
    expect(res!.txFec).toBe(5.5);
    expect(res!.vlrMneg).toBe(50000);
    expect(typeof res!.data_fechamento).toBe('string');
  });

  test('map log009 parcelas', () => {
    const raw = { rows: [{ pipCod: 1, pipDtaVcto: 1765756800000, pipMnyValor: 220000, totalPago: 160000 }] };
    const res = mapLog009ParcelasToPayments(raw);
    expect(res[0].value).toBe(220000);
    expect(res[0].paid).toBe(true);
  });

  test('map imp021 despesas', () => {
    const raw = { pidMnyValormn: 2702793.85, impDesNome: 'ENCARGOS FINANCEIROS' };
    const res = mapImp021Despesas(raw);
    expect(res).not.toBeNull();
    expect(res!.value).toBe(2702793.85);
    expect(res!.descricao).toMatch(/ENCARGOS/);
  });

  test('map psq015 baixas', () => {
    const raw = [{ id: 123, numero: 'N1', vlr: 1000, data: 1765756800000 }];
    const res = mapPsq015Baixas(raw);
    expect(res[0].value).toBe(1000);
    expect(res[0].date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });
});