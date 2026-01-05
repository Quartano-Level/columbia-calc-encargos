import axios, { AxiosInstance } from 'axios';
import { boxLog } from '../utils/index.js';

class ConexosService {
  private sid: string | null = null;
  private sidExpiresAt: number | null = null;
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading-hml.conexos.cloud/api',
      timeout: 10000,
    });
  }

  private extractSidFromSetCookie(setCookie: string[] | undefined): string | null {
    console.log('[Conexos] set-cookie header:', setCookie);
    if (!setCookie) return null;
    const sidCookie = setCookie.find((c) => c.startsWith('sid='));
    if (!sidCookie) {
      console.log('[Conexos] Nenhum cookie sid= encontrado');
      return null;
    }
    const sid = sidCookie.split(';')[0].replace('sid=', '');
    console.log('[Conexos] SID extraído:', sid ? `${sid.substring(0, 10)}...` : 'vazio');
    return sid;
  }

  async login(sessionToKill?: string): Promise<void> {
    boxLog('Conexos: login attempt', { sessionToKill });
    const username = process.env.CONEXOS_USERNAME || 'MPS_FRANCINEI';
    const password = process.env.CONEXOS_PASSWORD || 'Abc123456@';
    console.log('[Conexos] Tentando login...', sessionToKill ? `(matando sessão ${sessionToKill.substring(0, 8)}...)` : '');

    const body: { username: string; password: string; sessionToKill?: string } = { username, password };
    if (sessionToKill) {
      body.sessionToKill = sessionToKill;
    }

    try {
      const resp = await this.client.post('/login', body);
      console.log('[Conexos] Login response status:', resp.status);
      console.log('[Conexos] Login response headers:', Object.keys(resp.headers));
      const sid = this.extractSidFromSetCookie(resp.headers['set-cookie']);
      if (!sid) throw new Error('Falha ao obter sid do login Conexos');
      this.sid = sid;
      console.log('[Conexos] Login bem sucedido, sid armazenado');
      // Opcional: definir validade do sid (ex: 30min)
      this.sidExpiresAt = Date.now() + 25 * 60 * 1000;
    } catch (err: any) {
      console.error('[Conexos] ERRO no login:');
      console.error('[Conexos] Status:', err.response?.status);
      console.error('[Conexos] Data:', JSON.stringify(err.response?.data || err.message));

      // Tratar erro de max sessions
      const errorData = err.response?.data;
      if (errorData?.type === 'LOGIN_ERROR_MAX_SESSIONS' && Array.isArray(errorData.sessions) && !sessionToKill) {
        console.log('[Conexos] Limite de sessões atingido. Encontrando sessão mais antiga para encerrar...');

        // Encontrar a sessão mais antiga (menor sessionLastAccessedTime)
        const sessions = errorData.sessions as Array<{ sessionId: string; sessionLastAccessedTime: number }>;
        const oldestSession = sessions.reduce((oldest, current) =>
          current.sessionLastAccessedTime < oldest.sessionLastAccessedTime ? current : oldest
        );

        console.log('[Conexos] Encerrando sessão mais antiga:', oldestSession.sessionId,
          '(último acesso:', new Date(oldestSession.sessionLastAccessedTime).toISOString(), ')');

        // Refazer login matando a sessão mais antiga
        return this.login(oldestSession.sessionId);
      }

      throw err;
    }
  }

  async ensureSid() {
    if (!this.sid || (this.sidExpiresAt && Date.now() > this.sidExpiresAt)) {
      await this.login();
    }
  }

  getAuthHeaders() {
    return this.sid ? { Cookie: `sid=${this.sid}` } : {};
  }

  /**
   * Log estruturado para requisições ao Conexos
   * @param reqName Nome da requisição (ex: 'getContracts')
   * @param method Método HTTP
   * @param url URL da requisição
   * @param payload Body da requisição (opcional)
   * @param response Resposta (opcional) - fragmentada para evitar poluição
   * @param error Erro (opcional)
   */
  private logRequest(
    reqName: string,
    method: 'GET' | 'POST',
    url: string,
    payload?: any,
    response?: { status: number; data?: any },
    error?: { status?: number; message?: string; data?: any }
  ) {
    const timestamp = new Date().toISOString();
    const separator = '─'.repeat(60);

    console.log(`\n${separator}`);
    console.log(`📡 [${reqName}] ${method} ${url}`);
    console.log(`⏰ ${timestamp}`);

    if (payload) {
      console.log(`📤 Payload:`, JSON.stringify(payload, null, 2));
    }

    if (response) {
      console.log(`✅ Response Status: ${response.status}`);
      if (response.data) {
        // Fragmentar response para evitar poluição
        const data = response.data;
        // Mostrar primeiro item COMPLETO como amostra se existir
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          console.log(`📥 Response: count=${data.count}, rowsCount=${data.rows.length}`);
          console.log(`📥 firstRow (completo):`, JSON.stringify(data.rows[0], null, 2));
        } else if (typeof data === 'object' && !Array.isArray(data) && !data.rows) {
          // Se não for paginado, mostrar o objeto inteiro (GET de item único)
          console.log(`📥 Response Data:`, JSON.stringify(data, null, 2));
        } else {
          console.log(`📥 Response: count=${data.count}, rowsCount=${data.rows?.length || 0}`);
        }
      }
    }

    if (error) {
      console.log(`❌ Error Status: ${error.status || 'N/A'}`);
      console.log(`❌ Error Message: ${error.message}`);
      if (error.data) {
        console.log(`❌ Error Data:`, JSON.stringify(error.data, null, 2));
      }
    }

    console.log(`${separator}\n`);
  }

  async getContracts() {
    await this.ensureSid();
    const body = {
      fieldList: [],
      filterList: { "vldStatus#IN": ["1"] },
      pageNumber: 1,
      pageSize: 100,
      serviceName: "imp059",
      orderList: { orderList: [{ propertyName: "imcCod", order: "desc" }] }
    };
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };
    const url = '/imp059/list';
    try {
      // this.logRequest('getContracts', 'POST', url, body);
      const resp = await this.client.post(url, body, { headers });
      // this.logRequest('getContracts', 'POST', url, body, { status: resp.status, data: resp.data });
      return resp.data?.rows || [];
    } catch (err: any) {
      // this.logRequest('getContracts', 'POST', url, body, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers });
        return retryResp.data?.rows || [];
      }
      throw err;
    }
  }

  async getContractsByProcess(priCod: number) {
    await this.ensureSid();

    const body = {
      fieldList: [],
      filterList: {
        "fPriCod#EQ": priCod,
        "vldStatus#IN": ["1"]
      },
      pageNumber: 1,
      pageSize: 100,
      serviceName: "imp059",
      orderList: { orderList: [{ propertyName: "imcCod", order: "desc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/imp059/list';
    try {
      // this.logRequest('getContractsByProcess', 'POST', url, body);
      const resp = await this.client.post(url, body, { headers });
      // this.logRequest('getContractsByProcess', 'POST', url, body, { status: resp.status, data: resp.data });
      return resp.data?.rows || [];
    } catch (err: any) {
      // this.logRequest('getContractsByProcess', 'POST', url, body, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data?.rows || [];
      }
      throw err;
    }
  }

  async getProcesses(filters?: { priCod?: string; priCodIn?: number[]; priEspRefcliente?: string }) {
    boxLog('Conexos: getProcesses Input', filters);
    await this.ensureSid();
    const filterList: Record<string, any> = { "priVldStatus#IN": ["1"] };

    if (filters?.priCodIn && filters.priCodIn.length > 0) {
      // Usar operador #IN para filtrar múltiplos processos
      filterList["priCod#IN"] = filters.priCodIn;
    } else if (filters?.priCod) {
      filterList["priCod#EQ"] = Number(filters.priCod);
    }
    if (filters?.priEspRefcliente) {
      filterList["priEspRefcliente#LIKE"] = `%${filters.priEspRefcliente}%`;
    }

    const body = {
      fieldList: [],
      filterList,
      pageNumber: 1,
      pageSize: 100,
      serviceName: "imp021",
      orderList: { orderList: [{ propertyName: "priCod", order: "desc" }] }
    };
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };
    const url = '/imp021/list';
    try {
      // this.logRequest('getProcesses', 'POST', url, body);
      const resp = await this.client.post(url, body, { headers });
      // this.logRequest('getProcesses', 'POST', url, body, { status: resp.status, data: resp.data });

      // Log dos campos úteis para a tabela da Home
      const rows = resp.data?.rows || [];
      if (rows.length > 0) {
        console.log('\n📊 [imp021] Campos de câmbio encontrados:');
        rows.forEach((row: any, index: number) => {
          console.log(`  [${index}] priCod: ${row.priCod}`);
          console.log(`      priFltTaxaConv (Taxa de câmbio): ${row.priFltTaxaConv}`);
          console.log(`      priMnyCifDolar (Valor CIF USD): ${row.priMnyCifDolar}`);
          console.log(`      moeEspNomeConv (Moeda): ${row.moeEspNomeConv}`);
        });
      }

      return rows;
    } catch (err: any) {
      // this.logRequest('getProcesses', 'POST', url, body, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers });
        return retryResp.data?.rows || [];
      }
      throw err;
    }
  }

  async getParcelsByProcessId(processId: string) {
    boxLog('Conexos: getParcelsByProcessId Input', { processId });
    await this.ensureSid();
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };
    try {
      const resp = await this.client.get(`/log009/parcelas/list?imcCod=${processId}`, { headers });
      // Pode vir como { rows: [...] } ou array direto
      return resp.data?.rows || resp.data;
    } catch (err: any) {
      // Unauthorized -> re-login and retry GET once
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(`/log009/parcelas/list?imcCod=${processId}`, { headers });
        console.log(retryResp.data, 1); // --- IGNORE ---
        return retryResp.data?.rows || retryResp.data;
      }

      // If GET is rejected (405) or returns 400 required filter, try alternative GET to resource `/log009/${processId}`
      const status = err?.response?.status;
      const respData = err?.response?.data;
      // Common Conexos error: missing required filter (e.g., invCod). Try direct resource endpoint as fallback
      if (status === 405 || (status === 400 && respData && typeof respData === 'object' && (respData.type === 'GENERIC' || JSON.stringify(respData).includes('REQUIRED_FILTER_ERROR')))) {

        // Try POST fallback if alt GET didn't return usable data
        try {
          const invFilter = Number(processId).toString() === processId ? Number(processId) : processId;
          const baseFieldList = ["pipCod", "pipDtaVcto", "pipMnyValor", "pipNumParcelas", "pipNumOpCambio", "pipNumDiasVcto", "pipMnyValormn", "totalPago"];
          let attemptFields = baseFieldList.slice();

          const doPost = async (fields: string[]) => {
            const body = {
              fieldList: [],
              filterList: { "invCod": invFilter },
              pageNumber: 1,
              pageSize: 200,
              orderList: { orderList: [{ propertyName: "pipCod", order: "desc" }] }
            };
            return await this.client.post('/log009/parcelas/list', body, { headers });
          };

          // First attempt
          try {
            const postResp = await doPost([]);
            console.log(postResp.data, 2); // --- IGNORE ---
            return postResp.data?.rows || postResp.data || [];
          } catch (postErr: any) {
            // Inspect error to see if it's due to missing fields and retry without them once
            const errData = postErr?.response?.data;
            const messages = Array.isArray(errData?.messages) ? errData.messages.map((m: any) => m.message || '') : [];
            const missing: string[] = [];
            for (const m of messages) {
              const match = m.match(/'([^']+)' not found/);
              if (match) missing.push(match[1]);
            }

            if (missing.length > 0) {
              // Remove missing fields and retry once
              const filtered = attemptFields.filter(f => !missing.includes(f));
              if (filtered.length === 0) {
                const postStatus = postErr?.response?.status;
                const bodyText = errData ? JSON.stringify(errData) : postErr.message;
                throw new Error(`Parcelas fallback POST failed (${postStatus}): ${bodyText}`);
              }

              try {
                const retryResp = await doPost(filtered);
                console.log(retryResp.data, 3); // --- IGNORE ---
                return retryResp.data?.rows || retryResp.data || [];
              } catch (postErr2: any) {
                const postStatus2 = postErr2?.response?.status;
                const bodyText2 = postErr2?.response?.data ? JSON.stringify(postErr2.response.data) : postErr2.message;
                // If retry failed, fall through to additional fallback attempts below
                console.warn('Parcelas POST retry after removing fields failed', postStatus2, bodyText2);
              }
            }

            // If no missing-field pattern found or retry failed, try additional fallbacks
            console.warn('Parcelas POST first attempt failed', postErr?.response?.status, errData || postErr.message);

            // 1) Try empty fieldList (server may accept empty to return rows)
            try {
              const emptyResp = await doPost([]);
              console.log(emptyResp.data, 4); // --- IGNORE ---
              return emptyResp.data?.rows || emptyResp.data || [];
            } catch (emptyErr: any) {
              console.warn('Parcelas POST with empty fieldList failed', emptyErr?.response?.status, emptyErr?.response?.data || emptyErr.message);
            }

            // 2) Try alternative filter key 'invCod#EQ'
            try {
              const bodyAlt = {
                fieldList: [],
                filterList: { "invCod#EQ": invFilter },
                pageNumber: 1,
                pageSize: 200,
                orderList: { orderList: [{ propertyName: "pipCod", order: "desc" }] }
              };
              const altResp = await this.client.post('/log009/parcelas/list', bodyAlt, { headers });
              console.log(altResp.data, 5); // --- IGNORE ---
              return altResp.data?.rows || altResp.data || [];
            } catch (altErr: any) {
              console.warn('Parcelas POST with invCod#EQ failed', altErr?.response?.status, altErr?.response?.data || altErr.message);
            }

            // 3) Try alternative filter key 'imcCod#EQ' (legacy)
            try {
              const bodyAlt2 = {
                fieldList: [],
                filterList: { "imcCod#EQ": invFilter },
                pageNumber: 1,
                pageSize: 200,
                orderList: { orderList: [{ propertyName: "pipCod", order: "desc" }] }
              };
              const altResp2 = await this.client.post('/log009/parcelas/list', bodyAlt2, { headers });
              console.log(altResp2.data, 6); // --- IGNORE ---
              return altResp2.data?.rows || altResp2.data || [];
            } catch (altErr2: any) {
              console.warn('Parcelas POST with imcCod#EQ failed', altErr2?.response?.status, altErr2?.response?.data || altErr2.message);
            }

            // If everything fails, rethrow original error
            const postStatus = postErr?.response?.status;
            const bodyText = errData ? JSON.stringify(errData) : postErr.message;
            throw new Error(`Parcelas fallback POST failed (${postStatus}): ${bodyText}`);
          }
        } catch (postErr: any) {
          const postStatus = postErr?.response?.status;
          const bodyText = postErr?.response?.data ? JSON.stringify(postErr.response.data) : postErr.message;
          throw new Error(`Parcelas fallback POST failed (${postStatus}): ${bodyText}`);
        }
      }

      // Re-throw other errors
      throw err;
    }
  }

  async getDespesasByProcessId(processId: string) {
    boxLog('Conexos: getDespesasByProcessId Input', { processId });
    await this.ensureSid();
    const body = {
      fieldList: [],
      filterList: { "pidVldStatus#EQ": "1" },
      pageNumber: 1,
      pageSize: 100,
      serviceName: "imp021.ImpProcessoDespesas",
      orderList: { orderList: [{ propertyName: "prjCod", order: "asc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    try {
      const resp = await this.client.post(`/imp021/DespesasProcesso/${processId}`, body, { headers });
      return resp.data;
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(`/imp021/DespesasProcesso/${processId}`, body, { headers });
        return retryResp.data;
      }
      throw err;
    }
  }

  async getCDI(startDate?: string, endDate?: string) {
    boxLog('Conexos: getCDI Input', { startDate, endDate });
    await this.ensureSid();

    // Construir filterList - filtrar por intervalo se fornecido
    const filterList: Record<string, any> = {};
    if (startDate) {
      // Converter data ISO (YYYY-MM-DD) para timestamp em milissegundos (meia-noite UTC)
      const dateObj = new Date(startDate);
      dateObj.setUTCHours(0, 0, 0, 0);
      filterList["ftxDtaTaxa#GE"] = dateObj.getTime();
    }
    if (endDate) {
      const dateObj = new Date(endDate);
      dateObj.setUTCHours(0, 0, 0, 0);
      filterList["ftxDtaTaxa#LE"] = dateObj.getTime();
    }

    const body = {
      fieldList: [],
      filterList,
      pageNumber: 1,
      pageSize: 20,
      serviceName: "fin101.FinTaxasCDI",
      orderList: { orderList: [{ propertyName: "ftxDtaTaxa", order: "desc" }] }
    };

    const getHeaders = () => ({
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    });

    try {
      const resp = await this.client.post('/fin101/FinTaxasCDI/list', body, { headers: getHeaders() });
      return resp.data;
    } catch (err: any) {
      // If unauthorized, try to login and retry POST
      if (err.response && err.response.status === 401) {
        console.log('[Conexos] 401 em getCDI, refazendo login...');
        await this.login();
        const retryResp = await this.client.post('/fin101/FinTaxasCDI/list', body, { headers: getHeaders() });
        return retryResp.data;
      }

      // Some Conexos environments may reject POST with 405; try GET fallback
      if (err.response && err.response.status === 405) {
        try {
          const getResp = await this.client.get('/fin101/FinTaxasCDI/list', { headers: this.getAuthHeaders() });
          return getResp.data;
        } catch (innerErr: any) {
          // If GET also fails, include both errors in the thrown message
          const message = `CDI POST returned 405 and GET fallback failed (${innerErr?.response?.status || innerErr?.message})`;
          throw new Error(message);
        }
      }

      // Re-throw original error for other cases, but add response details for easier debugging
      const status = err.response?.status;
      const bodyText = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      throw new Error(`CDI fetch failed (${status}): ${bodyText}`);
    }
  }

  async getProcessById(id: string) {
    boxLog('Conexos: getProcessById Input', { id });
    await this.ensureSid();
    const getHeaders = () => ({
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    });
    try {
      const resp = await this.client.get(`/imp021/${id}`, { headers: getHeaders() });
      return resp.data;
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        console.log('[Conexos] 401 em getProcessById, refazendo login...');
        await this.login();
        const retryResp = await this.client.get(`/imp021/${id}`, { headers: getHeaders() });
        return retryResp.data;
      }
      throw err;
    }
  }

  /**
   * Busca processos que possuem contratos de câmbio vinculados.
   * Fluxo:
   * 1. Busca todos os contratos de câmbio (imp059)
   * 2. Extrai os fPriCod únicos (referência ao processo)
   * 3. Busca processos filtrando por priCod#IN
   * 4. Retorna processos enriquecidos com dados do contrato
   */
  async getProcessesByContractId(imcCod: number) {
    if (!imcCod) return [];

    // Ensure session
    await this.ensureSid();

    const body = {
      fieldList: [],
      filterList: {},
      pageNumber: 1,
      pageSize: 20,
      orderList: { orderList: [{ propertyName: "priCod", order: "asc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = `/imp059/processos/list/${imcCod}`;
    try {
      // this.logRequest('getProcessesByContractId', 'POST', url, body);
      const resp = await this.client.post(url, body, { headers });
      // this.logRequest('getProcessesByContractId', 'POST', url, body, { status: resp.status, data: resp.data });
      return resp.data?.rows || [];
    } catch (err: any) {
      // this.logRequest('getProcessesByContractId', 'POST', url, body, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data?.rows || [];
      }
      return [];
    }
  }

  /**
   * Busca processos que possuem contratos de câmbio vinculados.
   * Fluxo Atualizado:
   * 1. Busca todos os contratos de câmbio (imp059)
   * 2. Para cada contrato, busca os processos vinculados (/imp059/processos/list/{imcCod})
   * 3. Consolidar priCods únicos
   * 4. Busca processos em massa filtrando por priCod#IN
   * 5. Retorna processos enriquecidos com dados do contrato
   */
  async getProcessesWithContracts() {
    await this.ensureSid();

    console.log('\n========== getProcessesWithContracts (Fluxo V2) ==========');

    // 1. Buscar todos os contratos de câmbio
    console.log('[1] Buscando contratos...');
    const contracts = await this.getContracts();
    const contractsCount = contracts?.length || 0;
    console.log('[1] Contratos encontrados:', contractsCount);

    if (contractsCount === 0) {
      return { processes: [], contracts: [] };
    }

    // 2. Para cada contrato, buscar processos vinculados
    // Mapeamento: priCod -> Contract[]
    const processContractMap = new Map<number, any[]>();
    const allPriCods = new Set<number>();

    console.log('[2] Buscando processos para cada contrato...');

    // Executar em paralelo (com limite se necessário, aqui Promise.all para simplicidade dado volume baixo ~20)
    const contractPromises = contracts.map(async (contract: any) => {
      if (!contract.imcCod) return;

      const relatedProcs = await this.getProcessesByContractId(contract.imcCod);

      if (relatedProcs && relatedProcs.length > 0) {
        relatedProcs.forEach((rp: any) => {
          if (rp.priCod) {
            allPriCods.add(rp.priCod);

            // Vincular contrato a este processo no mapa
            const existing = processContractMap.get(rp.priCod) || [];
            existing.push(contract);
            processContractMap.set(rp.priCod, existing);
          }
        });
      }
    });

    await Promise.all(contractPromises);

    const distinctProcessIds = Array.from(allPriCods);
    console.log(`[2] Total de processos únicos identificados: ${distinctProcessIds.length}`);

    if (distinctProcessIds.length === 0) {
      return { processes: [], contracts };
    }

    // 3. Buscar detalhes completos dos processos
    console.log('[3] Buscando detalhes dos processos em massa...');
    const processes = await this.getProcesses({ priCodIn: distinctProcessIds });
    console.log(`[3] Detalhes recuperados: ${processes?.length || 0} processos`);

    // 4. Enriquecer processos com dados do contrato
    console.log('[4] Enriquecendo processos...');
    const processesWithContracts = processes.map((proc: any) => {
      const priCod = Number(proc.priCod);
      const relatedContracts = processContractMap.get(priCod) || [];

      return {
        ...proc,
        contracts: relatedContracts,
        // Dados do primeiro contrato para exibição na listagem
        contractData: relatedContracts.length > 0 ? {
          taxa: relatedContracts[0].imcMnyTaxa,
          moeda: relatedContracts[0].moeEspNome,
          valorMoeda: relatedContracts[0].imcMnyValor,
          imcCod: relatedContracts[0].imcCod,
        } : null,
      };
    });

    return {
      processes: processesWithContracts,
      contracts,
      totalProcesses: processesWithContracts.length,
      totalContracts: contracts.length,
    };
  }

  async getProcessesWithContractsEnriched() {
    await this.ensureSid();

    console.log('\n========== getProcessesWithContracts (Enriched) ==========');

    // 1. Buscar todos os contratos de câmbio
    console.log('[1] Buscando contratos...');
    const contracts = await this.getContracts();
    const contractsCount = contracts?.length || 0;
    console.log('[1] Contratos encontrados:', contractsCount);

    if (contractsCount === 0) {
      return { processes: [], contracts: [] };
    }

    // 2. Para cada contrato, buscar processos vinculados
    const processContractMap = new Map<number, any[]>();
    const allPriCods = new Set<number>();

    console.log('[2] Buscando processos para cada contrato...');

    const contractPromises = contracts.map(async (contract: any) => {
      if (!contract.imcCod) return;
      const relatedProcs = await this.getProcessesByContractId(contract.imcCod);
      if (relatedProcs && relatedProcs.length > 0) {
        relatedProcs.forEach((rp: any) => {
          if (rp.priCod) {
            allPriCods.add(rp.priCod);
            const existing = processContractMap.get(rp.priCod) || [];
            existing.push(contract);
            processContractMap.set(rp.priCod, existing);
          }
        });
      }
    });

    await Promise.all(contractPromises);

    const distinctProcessIds = Array.from(allPriCods);
    console.log(`[2] Total de processos únicos identificados: ${distinctProcessIds.length}`);

    if (distinctProcessIds.length === 0) {
      return { processes: [], contracts };
    }

    // 3. Buscar detalhes básicos dos processos (imp021)
    console.log('[3] Buscando basico dos processos (imp021)...');
    const processes = await this.getProcesses({ priCodIn: distinctProcessIds });
    console.log(`[3] Processos básicos recuperados: ${processes?.length || 0}`);

    // 4. Enriquecer processos com dados do contrato + log009 + psq015
    console.log('[4] Enriquecendo processos (log009 + psq015)...');

    const enrichedPromises = processes.map(async (proc: any) => {
      const priCod = Number(proc.priCod);
      const relatedContracts = processContractMap.get(priCod) || [];

      // Busca títulos financeiros (psq015) - para obter dados de pagamento"
      const financialTitles = await this.getFinancialTitlesPsq015(priCod);

      // Busca invCod via log009/parcelas/list (psq015 não retorna invCod)
      const invCod = await this.getInvoiceCodeLog009(priCod);

      // Busca detalhes (incoterm) se tiver invCod
      let log009Data = null;
      if (invCod) {
        log009Data = await this.getProcessDetailsLog009(invCod);
      }

      let detailedData = log009Data;
      if (Array.isArray(log009Data) && log009Data.length > 0) {
        detailedData = log009Data[0];
      } else if (Array.isArray(log009Data)) {
        detailedData = null;
      }

      // Buscar baixas para cada título encontrado
      let paymentInfo = null;
      let paymentsList: any[] = [];

      if (financialTitles && financialTitles.length > 0) {
        // Buscar baixas (discharges) para todos os títulos em paralelo
        const titlesWithDischargesPromises = financialTitles.map(async (title: any) => {
          const discharges = await this.getTitleDischargesPsq015(title);
          return { ...title, discharges };
        });

        paymentsList = await Promise.all(titlesWithDischargesPromises);

        // Tentar encontrar a data de pagamento real (primeira baixa com data válida)
        const allDischarges = paymentsList.flatMap(t => t.discharges || []);

        if (allDischarges.length > 0) {
          // Ordenar por data (preferencia borDtaMvto, depois bxaDtaBaixa)
          allDischarges.sort((a: any, b: any) => {
            const dateA = a.borDtaMvto || a.bxaDtaBaixa || 0;
            const dateB = b.borDtaMvto || b.bxaDtaBaixa || 0;
            const dA = typeof dateA === 'string' ? new Date(dateA).getTime() : (dateA || 0);
            const dB = typeof dateB === 'string' ? new Date(dateB).getTime() : (dateB || 0);
            return dA - dB;
          });

          const firstDischarge = allDischarges[0];
          const finalDate = firstDischarge.borDtaMvto || firstDischarge.bxaDtaBaixa;

          paymentInfo = {
            status: 'Pago',
            date: finalDate,
            amount: firstDischarge.bxaMnyValor,
            details: firstDischarge
          };
        } else if (paymentsList.length > 0) {
          paymentInfo = {
            status: 'Aberto',
            date: null,
            nextDueDate: paymentsList[0].titDtaVencimento
          };
        }
      } else {
        paymentInfo = { status: 'Sem titulos' };
      }

      // Se ainda não temos data de pagamento das baixas, verificar no contrato (borDtaMvto)
      if ((!paymentInfo || !paymentInfo.date) && relatedContracts.length > 0) {
        const contract = relatedContracts[0];
        if (contract.borDtaMvto) {
          // Se achamos data de movimento no contrato, assumimos que foi pago/liquidado
          paymentInfo = {
            status: 'Pago',
            date: contract.borDtaMvto,
            amount: paymentInfo?.amount,
            details: contract
          };
        }
      }

      return {
        ...proc,
        // Sobrescrevendo/Enriquecendo campos
        clientName: detailedData?.dpeNomPessoaCons || detailedData?.dpeNomPessoa || proc.dpeNomPessoa,
        incoterm: detailedData?.incEspSigla,

        contracts: relatedContracts,
        payments: paymentsList, // Lista completa com baixas
        paymentInfo, // Status resumido

        // Dados resumidos do contrato para tabela
        contractData: relatedContracts.length > 0 ? {
          taxa: relatedContracts[0].imcMnyTaxa,
          moeda: relatedContracts[0].moeEspNome,
          valorMoeda: relatedContracts[0].imcMnyValor,
          imcCod: relatedContracts[0].imcCod,
        } : null,

        // Dados para exibição na tabela (compatibilidade)
        paymentData: paymentInfo
      };
    });

    const processesWithContracts = await Promise.all(enrichedPromises);

    return {
      processes: processesWithContracts,
      contracts,
      totalProcesses: processesWithContracts.length,
      totalContracts: contracts.length,
    };
  }

  async getInvoiceCodeLog009(priCod: number) {
    if (!priCod) return null;
    await this.ensureSid();

    const url = '/log009/list';
    const body = {
      fieldList: [],
      filterList: { "priCod#EQ": priCod },
      pageNumber: 1,
      pageSize: 10
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    try {
      // this.logRequest('getInvoiceCodeLog009', 'POST', url, body);
      const resp = await this.client.post(url, body, { headers });
      // this.logRequest('getInvoiceCodeLog009', 'POST', url, body, { status: resp.status, data: resp.data });
      if (resp.data && resp.data.rows && resp.data.rows.length > 0) {
        const code = resp.data.rows[0].invCod;
        // console.log(`[getInvoiceCodeLog009] priCod=${priCod} -> invCod=${code}`);
        return code;
      }
      // console.log(`[getInvoiceCodeLog009] priCod=${priCod} -> Nenhum invCod encontrado (rows: ${resp.data?.rows?.length || 0})`);
      return null;
    } catch (err: any) {
      // this.logRequest('getInvoiceCodeLog009', 'POST', url, body, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        try {
          const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
          if (retryResp.data?.rows?.length > 0) return retryResp.data.rows[0].invCod;
        } catch (e) { return null; }
      }
      return null;
    }
  }

  async getProcessDetailsLog009(invCod: number) {
    if (!invCod) {
      // console.warn('[getProcessDetailsLog009] invCod não disponível no processo.');
      return null;
    }
    await this.ensureSid();

    const headers = {
      ...this.getAuthHeaders(),
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
    };

    const url = `/log009/${invCod}`;
    try {
      // this.logRequest('getProcessDetailsLog009', 'GET', url);
      const resp = await this.client.get(url, { headers });
      // this.logRequest('getProcessDetailsLog009', 'GET', url, undefined, { status: resp.status, data: resp.data });
      return resp.data;
    } catch (err: any) {
      // this.logRequest('getProcessDetailsLog009', 'GET', url, undefined, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        try {
          const retryResp = await this.client.get(url, { headers: { ...headers, ...this.getAuthHeaders() } });
          return retryResp.data;
        } catch (retryErr) { return null; }
      }
      return null;
    }
  }

  async getFinancialTitlesPsq015(priCod: number) {
    if (!priCod) return [];
    await this.ensureSid();

    const body = {
      fieldList: ["filCod", "priCod", "titDtaVencimento", "docCod", "titCod", "docTip", "docVldTipoFisFin"],
      filterList: {
        "fExibirRenegociados#EQ": "0",
        "fExibirAgrupados#EQ": "0",
        "fPriCod#EQ": priCod,
        "vldSituacao#IN": ["1"],
        "docVldPrevisao#EQ": "0",
        "filCod#IN": [2]
      },
      pageNumber: 1,
      pageSize: "20",
      orderList: { orderList: [{ propertyName: "filCod", order: "asc" }] },
      serviceName: "psq015"
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/psq015/list';
    try {
      // this.logRequest('getFinancialTitlesPsq015', 'POST', url, body);
      const resp = await this.client.post(url, body, { headers });
      // this.logRequest('getFinancialTitlesPsq015', 'POST', url, body, { status: resp.status, data: resp.data });
      return resp.data?.rows || [];
    } catch (err: any) {
      // this.logRequest('getFinancialTitlesPsq015', 'POST', url, body, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data?.rows || [];
      }
      return [];
    }
  }

  async getTitleDischargesPsq015(title: any) {
    // Nova URL sugerida: /psq015/{filCod}/{docTip}/{docCod}/{titCod}

    if (!title || !title.filCod || !title.docCod || !title.titCod) return [];

    await this.ensureSid();

    const docTip = title.docTip ?? 1;

    // Construção da URL conforme schema do usuário
    // Atenção: baseURL já inclui /api geralmente, mas se o usuário disse /api/psq015, e nossa base for .../api, fica /psq015 só.
    const url = `/psq015/${title.filCod}/${docTip}/${title.docCod}/${title.titCod}`;

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    try {
      // this.logRequest('getTitleDischargesPsq015', 'GET', url);
      const resp = await this.client.get(url, { headers });
      // this.logRequest('getTitleDischargesPsq015', 'GET', url, undefined, { status: resp.status, data: resp.data });

      // Se retornar array, é a lista de baixas ou detalhes
      if (Array.isArray(resp.data)) return resp.data;
      if (resp.data && Array.isArray(resp.data.rows)) return resp.data.rows;

      // Se retornou um objeto, encapsula em array
      if (resp.data) {
        return [resp.data];
      }

      return [];
    } catch (err: any) {
      // Erro 500 ou 404 - silencioso (dados podem não existir)
      if (err.response && (err.response.status === 500 || err.response.status === 404)) {
        return [];
      }

      // this.logRequest('getTitleDischargesPsq015', 'GET', url, undefined, undefined, { status: err.response?.status, message: err.message, data: err.response?.data });
      if (err.response && err.response.status === 401) {
        await this.login();
        try {
          const retryResp = await this.client.get(url, { headers: { ...headers, ...this.getAuthHeaders() } });
          const data = retryResp.data;
          if (Array.isArray(data)) return data;
          if (data && Array.isArray(data.rows)) return data.rows;
          return data ? [data] : [];
        } catch (retryErr: any) {
          return [];
        }
      }
      return [];
    }
  }

  async submitExpense(data: {
    processId: string | number;
    emissionDate: string;
    totalInterest: number;
    taxaDolarFiscal: number;
  }) {
    await this.ensureSid();

    // Data formatada para timestamp (meia-noite UTC para evitar problemas de fuso)
    const dateObj = new Date(data.emissionDate);
    dateObj.setUTCHours(0, 0, 0, 0);
    const timestamp = dateObj.getTime();

    // Valor convertido para BRL (se taxaDolarFiscal for fornecida, senao usa valor direto)
    const valorBRL = data.totalInterest * (data.taxaDolarFiscal || 1);

    const body = {
      moeCod: 790,
      gerVldFeatureCliente: 0,
      priCod: String(data.processId),
      priVldTipo: 3,
      frontModelName: "despesasProcesso",
      prjCod: 1,
      idtCod: 1,
      pidVldStatus: 1,
      impCod: 1081,
      pidVldFormaReteio: 2,
      pidDtaTaxas: timestamp,
      pdiVldOrigemDesp: 1,
      pidVldTipo: 1,
      pidVldLibera: 1,
      pidVldNfserv: 0,
      pidVldFonte: 1,
      impDesNome: "ENCARGOS FINANCEIROS",
      moeEspNome: "REAL/BRASIL",
      pidFltTxMneg: 1,
      ctpDesNome: "ENCARGOS FINANCEIROS",
      ctpCod: 672,
      prdDesNome: null,
      prdCod: null,
      pidMnyValormn: Number(valorBRL.toFixed(2)),
      pidMnyValorMneg: Number(valorBRL.toFixed(2)),
      filCod: "2"
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': '2',
      'cnx-usncod': '97',
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    boxLog('Conexos: submitExpense Payload', body);

    try {
      const resp = await this.client.post('/imp021/ProcessoDespesas', body, { headers });
      boxLog('Conexos: submitExpense Response', resp.data);
      return resp.data;
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post('/imp021/ProcessoDespesas', body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data;
      }
      const errorData = err.response?.data;
      console.error('[Conexos] ERRO ao submeter despesa:', errorData || err.message);
      throw err;
    }
  }
}

export const conexosService = new ConexosService();
