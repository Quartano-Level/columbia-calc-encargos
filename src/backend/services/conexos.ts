import axios, { AxiosInstance } from 'axios';
import { boxLog, DEBUG_VERBOSE } from '../utils/index.js';
import { config } from '../config.js';

class ConexosService {
  private sid: string | null = null;
  private sidExpiresAt: number | null = null;
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api',
      timeout: 40000,
    });
  }

  private extractSidFromSetCookie(setCookie: string[] | undefined): string | null {
    if (DEBUG_VERBOSE) console.log('[Conexos] set-cookie header:', setCookie);
    if (!setCookie) return null;
    const sidCookie = setCookie.find((c) => c.startsWith('sid='));
    if (!sidCookie) {
      if (DEBUG_VERBOSE) console.log('[Conexos] Nenhum cookie sid= encontrado');
      return null;
    }
    const sid = sidCookie.split(';')[0].replace('sid=', '');
    if (DEBUG_VERBOSE) console.log('[Conexos] SID extraído:', sid ? `${sid.substring(0, 10)}...` : 'vazio');
    return sid;
  }

  async login(sessionToKill?: string): Promise<void> {
    boxLog('Conexos: login attempt', { sessionToKill });
    const username = process.env.CONEXOS_USERNAME || 'MPS_FRANCINEI';
    const password = process.env.CONEXOS_PASSWORD || 'Abc123456@';
    if (DEBUG_VERBOSE) console.log('[Conexos] Tentando login...', sessionToKill ? `(matando sessão ${sessionToKill.substring(0, 8)}...)` : '');

    const body: { username: string; password: string; sessionToKill?: string } = { username, password };
    if (sessionToKill) {
      body.sessionToKill = sessionToKill;
    }

    try {
      const resp = await this.client.post('/login', body);
      if (DEBUG_VERBOSE) console.log('[Conexos] Login response status:', resp.status);
      if (DEBUG_VERBOSE) console.log('[Conexos] Login response headers:', Object.keys(resp.headers));
      const sid = this.extractSidFromSetCookie(resp.headers['set-cookie']);
      if (!sid) throw new Error('Falha ao obter sid do login Conexos');
      this.sid = sid;
      if (DEBUG_VERBOSE) console.log('[Conexos] Login bem sucedido, sid armazenado');
      // Opcional: definir validade do sid (ex: 30min)
      this.sidExpiresAt = Date.now() + 25 * 60 * 1000;
    } catch (err: any) {
      console.error('[Conexos] ERRO no login:');
      console.error('[Conexos] Status:', err.response?.status);
      console.error('[Conexos] Data:', JSON.stringify(err.response?.data || err.message));

      // Tratar erro de max sessions
      const errorData = err.response?.data;
      if (errorData?.type === 'LOGIN_ERROR_MAX_SESSIONS' && Array.isArray(errorData.sessions) && !sessionToKill) {
        if (DEBUG_VERBOSE) console.log('[Conexos] Limite de sessões atingido. Encontrando sessão mais antiga para encerrar...');

        // Encontrar a sessão mais antiga (menor sessionLastAccessedTime)
        const sessions = errorData.sessions as Array<{ sessionId: string; sessionLastAccessedTime: number }>;
        const oldestSession = sessions.reduce((oldest, current) =>
          current.sessionLastAccessedTime < oldest.sessionLastAccessedTime ? current : oldest
        );

        if (DEBUG_VERBOSE) console.log('[Conexos] Encerrando sessão mais antiga:', oldestSession.sessionId,
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
    if (!DEBUG_VERBOSE) return;
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
        const data = response.data;
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          console.log(`📥 Response: count=${data.count}, rowsCount=${data.rows.length}`);
          console.log(`📥 firstRow (completo):`, JSON.stringify(data.rows[0], null, 2));
        } else if (typeof data === 'object' && !Array.isArray(data) && !data.rows) {
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

  async getContracts(filCod: number = config.conexos.filCod, pageSize = 100) {
    await this.ensureSid();
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };
    const url = '/imp059/list';
    const getHeaders = () => ({ ...headers, ...this.getAuthHeaders() });
    const doRequest = async (pageNumber: number) => {
      const body = {
        fieldList: [],
        filterList: { "vldStatus#IN": ["1"] },
        pageNumber,
        pageSize,
        serviceName: "imp059",
        orderList: { orderList: [{ propertyName: "imcCod", order: "desc" }] }
      };
      const resp = await this.client.post(url, body, { headers: getHeaders() });
      return resp.data;
    };
    try {
      let allRows: any[] = [];
      let pageNumber = 1;
      let hasMorePages = true;
      while (hasMorePages) {
        const data = await doRequest(pageNumber);
        const rows = data?.rows || [];
        const count = data?.count ?? 0;
        allRows = allRows.concat(rows);
        hasMorePages = count > pageSize && allRows.length < count;
        pageNumber++;
      }
      return allRows;
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        await this.login();
        let allRows: any[] = [];
        let pageNumber = 1;
        let hasMorePages = true;
        while (hasMorePages) {
          const data = await doRequest(pageNumber);
          const rows = data?.rows || [];
          const count = data?.count ?? 0;
          allRows = allRows.concat(rows);
          hasMorePages = count > pageSize && allRows.length < count;
          pageNumber++;
        }
        return allRows;
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
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/imp059/list';
    try {
      const resp = await this.client.post(url, body, { headers });
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

  async getProcesses(filters?: { priCod?: string; priCodIn?: number[]; priEspRefcliente?: string; dateFrom?: string }, filCod: number = config.conexos.filCod) {
    boxLog('Conexos: getProcesses Input', filters);
    await this.ensureSid();
    const filterList: Record<string, any> = { "priVldStatus#IN": ["1"] };

    if (filters?.priCodIn && filters.priCodIn.length > 0) {
      filterList["priCod#IN"] = filters.priCodIn;
    } else if (filters?.priCod) {
      filterList["priCod#EQ"] = Number(filters.priCod);
    }
    if (filters?.priEspRefcliente) {
      filterList["priEspRefcliente#LIKE"] = `%${filters.priEspRefcliente}%`;
    }
    if (filters?.dateFrom) {
      filterList["priDtaAbertura#GE"] = new Date(`${filters.dateFrom}T00:00:00-03:00`).getTime();
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
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };
    const url = '/imp021/list';
    try {
      // this.logRequest('getProcesses', 'POST', url, body);
      const resp = await this.client.post(url, body, { headers });
      // this.logRequest('getProcesses', 'POST', url, body, { status: resp.status, data: resp.data });

      const rows = resp.data?.rows || [];
      if (DEBUG_VERBOSE && rows.length > 0) {
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

  /** Retorna TODOS os processos (sem filtro de contratos) com paginação automática */
  async getAllProcesses(pageSize = 500, filCod: number = config.conexos.filCod) {
    await this.ensureSid();
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    let allProcesses: any[] = [];
    let pageNumber = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const body = {
        fieldList: [],
        filterList: { "priVldStatus#IN": ["1"] },
        pageNumber,
        pageSize,
        serviceName: "imp021",
        orderList: { orderList: [{ propertyName: "priCod", order: "desc" }] }
      };

      const resp = await this.client.post('/imp021/list', body, { headers });
      const rows = resp.data?.rows || [];
      const count = resp.data?.count || 0;

      allProcesses = allProcesses.concat(rows);

      if (DEBUG_VERBOSE) {
        console.log(`[getAllProcesses] Página ${pageNumber}: ${rows.length} processos (total acumulado: ${allProcesses.length}/${count})`);
      }

      // Se pegou menos que pageSize, não há mais páginas
      // OU se já temos todos os processos (count)
      hasMorePages = rows.length === pageSize && allProcesses.length < count;
      pageNumber++;
    }

    console.log(`[getAllProcesses] ✓ Total de processos buscados: ${allProcesses.length}`);
    return allProcesses;
  }

  async getParcelsByProcessId(processId: string) {
    boxLog('Conexos: getParcelsByProcessId Input', { processId });
    await this.ensureSid();
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
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
        if (DEBUG_VERBOSE) console.log(retryResp.data, 1);
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
            if (DEBUG_VERBOSE) console.log(postResp.data, 2);
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
                if (DEBUG_VERBOSE) console.log(retryResp.data, 3);
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
              if (DEBUG_VERBOSE) console.log(emptyResp.data, 4);
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
              if (DEBUG_VERBOSE) console.log(altResp.data, 5);
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
              if (DEBUG_VERBOSE) console.log(altResp2.data, 6);
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
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = `/imp021/DespesasProcesso/${processId}`;

    // API Conexos retorna 405 para GET nesta rota - usar POST diretamente
    try {
      if (DEBUG_VERBOSE) console.log(`[Conexos] Fetching expenses: POST ${url}`);
      const resp = await this.client.post(url, body, { headers });
      const data = resp.data?.rows || resp.data;
      if (DEBUG_VERBOSE) console.log(`[Conexos] POST ${url} Success. Expenses found:`, Array.isArray(data) ? data.length : (data ? 1 : 0));
      return data;
    } catch (err: any) {
      console.error(`[Conexos] POST ${url} failed:`, err.message, err.response?.status);
      if (err.response && err.response.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data?.rows || retryResp.data;
      }
      throw err;
    }
  }

  async getCDI(startDate?: string, endDate?: string) {
    boxLog('Conexos: getCDI Input', { startDate, endDate });
    await this.ensureSid();

    // Construir filterList - filtrar por intervalo se fornecido
    // API Conexos para filtros espera timestamp em milisegundos
    const filterList: Record<string, any> = {};
    if (startDate) {
      // Converter data ISO (YYYY-MM-DD) para timestamp em milissegundos
      // Considera início do dia no fuso de Brasília (-03:00)
      const dateObj = new Date(startDate + 'T00:00:00-03:00');
      filterList["ftxDtaTaxa#GE"] = dateObj.getTime();
    }
    if (endDate) {
      // Considera fim do dia no fuso de Brasília (-03:00)
      const dateObj = new Date(endDate + 'T23:59:59.999-03:00');
      filterList["ftxDtaTaxa#LE"] = dateObj.getTime();
    }

    const body = {
      fieldList: [],
      filterList,
      pageNumber: 1,
      pageSize: 100,
      serviceName: "fin101.FinTaxasCDI",
      orderList: { orderList: [{ propertyName: "ftxDtaTaxa", order: "desc" }] }
    };

    const getHeaders = () => ({
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    });

    const url = '/fin101/FinTaxasCDI/list';
    if (DEBUG_VERBOSE) {
      console.log('\n========== CDI REQUEST DEBUG ==========');
      console.log('URL:', url);
      console.log('METHOD: POST');
      console.log('PAYLOAD:', JSON.stringify(body, null, 2));
      console.log('========================================\n');
    }

    try {
      const resp = await this.client.post(url, body, { headers: getHeaders() });
      if (DEBUG_VERBOSE) {
        console.log('[CDI Response] Status:', resp.status);
        console.log('[CDI Response] count:', resp.data?.count, 'rows:', resp.data?.rows?.length);
        console.log('[CDI Response] Full data:', JSON.stringify(resp.data, null, 2));
      }
      return resp.data;
    } catch (err: any) {
      if (DEBUG_VERBOSE) {
        console.log('\n========== CDI ERROR DEBUG ==========');
        console.log('[CDI Error] Status:', err.response?.status);
        console.log('[CDI Error] Response:', JSON.stringify(err.response?.data, null, 2));
        console.log('======================================\n');
      }

      // If unauthorized, try to login and retry POST
      if (err.response && err.response.status === 401) {
        if (DEBUG_VERBOSE) console.log('[Conexos] 401 em getCDI, refazendo login...');
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
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    });
    try {
      const resp = await this.client.get(`/imp021/${id}`, { headers: getHeaders() });
      return resp.data;
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        if (DEBUG_VERBOSE) console.log('[Conexos] 401 em getProcessById, refazendo login...');
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
  async getProcessesByContractId(imcCod: number, filCod: number = config.conexos.filCod) {
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
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = `/imp059/processos/list/${imcCod}`;
    try {
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || [];
      if (rows.length > 0) {
        console.log(`[getProcessesByContractId] imcCod=${imcCod} cnx-filcod=${filCod} → ${rows.length} processos: ${JSON.stringify(rows.map((r: any) => ({ priCod: r.priCod, filCod: r.filCod })))}`);
      }
      return rows;
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

    if (DEBUG_VERBOSE) console.log('\n========== getProcessesWithContracts (Fluxo V2) ==========');
    const contracts = await this.getContracts();
    const contractsCount = contracts?.length || 0;
    if (DEBUG_VERBOSE) console.log('[1] Contratos encontrados:', contractsCount);

    if (contractsCount === 0) {
      return { processes: [], contracts: [] };
    }

    // 2. Para cada contrato, buscar processos vinculados
    // Mapeamento: priCod -> Contract[]
    const processContractMap = new Map<number, any[]>();
    const allPriCods = new Set<number>();

    if (DEBUG_VERBOSE) console.log('[2] Buscando processos para cada contrato...');
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
    if (DEBUG_VERBOSE) console.log(`[2] Total de processos únicos identificados: ${distinctProcessIds.length}`);
    if (distinctProcessIds.length === 0) {
      return { processes: [], contracts };
    }
    if (DEBUG_VERBOSE) console.log('[3] Buscando detalhes dos processos em massa...');
    const processes = await this.getProcesses({ priCodIn: distinctProcessIds });
    if (DEBUG_VERBOSE) console.log(`[3] Detalhes recuperados: ${processes?.length || 0} processos`);
    if (DEBUG_VERBOSE) console.log('[4] Enriquecendo processos...');
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

    if (DEBUG_VERBOSE) console.log('\n========== getProcessesWithContracts (Enriched) ==========');
    const contracts = await this.getContracts();
    const contractsCount = contracts?.length || 0;
    if (DEBUG_VERBOSE) console.log('[1] Contratos encontrados:', contractsCount);
    if (contractsCount === 0) {
      return { processes: [], contracts: [] };
    }
    const processContractMap = new Map<number, any[]>();
    const allPriCods = new Set<number>();
    if (DEBUG_VERBOSE) console.log('[2] Buscando processos para cada contrato...');

    // Batches de 20 para não saturar o Conexos (mesmo padrão do export V2)
    const BATCH_SIZE = 20;
    for (let i = 0; i < contracts.length; i += BATCH_SIZE) {
      const batch = contracts.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (contract: any) => {
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
      }));
      if (DEBUG_VERBOSE) console.log(`[2]   Vinculados ${Math.min(i + BATCH_SIZE, contracts.length)}/${contracts.length} contratos`);
    }

    const distinctProcessIds = Array.from(allPriCods);
    if (DEBUG_VERBOSE) console.log(`[2] Total de processos únicos identificados: ${distinctProcessIds.length}`);
    if (distinctProcessIds.length === 0) {
      return { processes: [], contracts };
    }
    if (DEBUG_VERBOSE) console.log('[3] Buscando basico dos processos (imp021)...');
    const processes = await this.getProcesses({ priCodIn: distinctProcessIds });
    if (DEBUG_VERBOSE) console.log(`[3] Processos básicos recuperados: ${processes?.length || 0}`);
    if (DEBUG_VERBOSE) console.log('[4] Enriquecendo processos (log009 + psq015)...');

    const processesWithContracts: any[] = [];
    for (let i = 0; i < processes.length; i += BATCH_SIZE) {
      const batch = processes.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (proc: any) => {
      const priCod = Number(proc.priCod);
      const relatedContracts = processContractMap.get(priCod) || [];

      // Busca dados independentes em paralelo
      const [financialTitles, despesas, invCod, hasFinalizedInvoice] = await Promise.all([
        this.getFinancialTitlesPsq015(priCod),
        this.getDespesasByProcessId(String(priCod)),
        this.getInvoiceCodeLog009(priCod),
        this.hasFinalizedInvoiceByProcess(priCod),
      ]);

      // Busca detalhes (incoterm) se tiver invCod — depende do resultado acima
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
          // Ordenar por data DESCENDENTE (pegar a última baixa como data de liquidação real)
          allDischarges.sort((a: any, b: any) => {
            const dateA = a.borDtaMvto || a.bxaDtaBaixa || 0;
            const dateB = b.borDtaMvto || b.bxaDtaBaixa || 0;
            const dA = typeof dateA === 'string' ? new Date(dateA).getTime() : (dateA || 0);
            const dB = typeof dateB === 'string' ? new Date(dateB).getTime() : (dateB || 0);
            return dB - dA; // DESC
          });

          const lastDischarge = allDischarges[0];
          const finalDate = lastDischarge.borDtaMvto || lastDischarge.bxaDtaBaixa;

          paymentInfo = {
            status: 'Pago',
            date: finalDate,
            amount: lastDischarge.bxaMnyValor,
            details: lastDischarge
          };
        }
      }

      // Enriquecer cada contrato com dados reais de juros/baixa se disponíveis
      const enrichedContracts = relatedContracts.map((c: any) => {
        // Tentar encontrar o título correspondente (muitas vezes docCod do psq015 = imcCod do imp059)
        const correspondingTitle = paymentsList.find(t =>
          String(t.docCod) === String(c.imcCod) ||
          String(t.titCod) === String(c.imcCod) // fallback de busca por código
        );

        let realPaymentDate = null;
        if (correspondingTitle && correspondingTitle.discharges && correspondingTitle.discharges.length > 0) {
          // Pegar a data da última baixa ou da principal
          const lastBxa = [...correspondingTitle.discharges].sort((a, b) =>
            new Date(b.borDtaMvto || 0).getTime() - new Date(a.borDtaMvto || 0).getTime()
          )[0];
          realPaymentDate = lastBxa?.borDtaMvto || null;
        }

        return {
          ...c,
          // Prioridade para o que veio do psq015 (títulos financeiros)
          titDtaVencimento: correspondingTitle?.titDtaVencimento || null,
          borDtaMvto: realPaymentDate || null // Removendo fallback do cabeçalho do contrato se não houver baixa real
        };
      });

      return {
        ...proc,
        clientName: detailedData?.dpeNomPessoaCons || detailedData?.dpeNomPessoa || proc.dpeNomPessoa,
        incoterm: detailedData?.incEspSigla,
        contracts: enrichedContracts,
        payments: paymentsList,
        paymentInfo,
        expenses: Array.isArray(despesas) ? despesas : (despesas?.rows || []),
        hasExistingInterest: Array.isArray(despesas) ? despesas.some((d: any) =>
          (d.impDesNome || '').toUpperCase().includes('ENCARGOS FINANCEIROS') ||
          (d.ctpDesNome || '').toUpperCase().includes('ENCARGOS FINANCEIROS')
        ) : false,
        hasFinalizedInvoice,

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
    }));
    processesWithContracts.push(...batchResults);
    if (DEBUG_VERBOSE) console.log(`[4]   Enriquecidos ${Math.min(i + BATCH_SIZE, processes.length)}/${processes.length} processos`);
  }

    return {
      processes: processesWithContracts,
      contracts,
      totalProcesses: processesWithContracts.length,
      totalContracts: contracts.length,
    };
  }

  /**
   * Processos para exportação da planilha:
   * Inclui APENAS processos que tenham documento/vencimento/baixa OU encargos financeiros.
   * - (A) Processos com contrato que tenham (docs em baixa OU encargos financeiros)
   * - (B) Processos sem contrato mas com encargo financeiro
   * Exclui: processos com contrato mas sem docs nem encargos; processos sem contrato nem encargos.
   */
  async getProcessesForExport(filCod: number = config.conexos.filCod) {
    await this.ensureSid();

    console.log(`\n★★★ EXPORT PLANILHA (Filial ${filCod}) ★★★`);

    // 1. Buscar TODOS os processos ativos (com paginação)
    console.log('[getProcessesForExport] 1/4 Buscando todos os processos ativos...');
    const allProcesses = await this.getAllProcesses(500, filCod);
    console.log(`[getProcessesForExport] Total processos ativos: ${allProcesses.length}`);

    // 2. Buscar TODOS os contratos e vincular aos processos (mesma estratégia da home)
    console.log('[getProcessesForExport] 2/4 Buscando e vinculando contratos aos processos...');
    const allContracts = await this.getContracts(filCod);

    // Criar mapa priCod -> contratos usando API Conexos (mesmo método da home)
    const contractsByProcess = new Map<number, any[]>();
    const concurrencyLimitContracts = 20;

    for (let i = 0; i < allContracts.length; i += concurrencyLimitContracts) {
      const batch = allContracts.slice(i, i + concurrencyLimitContracts);

      await Promise.all(batch.map(async (contract: any) => {
        if (!contract.imcCod) return;

        try {
          // Buscar processos relacionados via API Conexos (mesmo que a home faz)
          const relatedProcs = await this.getProcessesByContractId(contract.imcCod, filCod);

          if (relatedProcs && relatedProcs.length > 0) {
            relatedProcs.forEach((rp: any) => {
              if (rp.priCod) {
                const priCod = Number(rp.priCod);
                if (!contractsByProcess.has(priCod)) {
                  contractsByProcess.set(priCod, []);
                }
                contractsByProcess.get(priCod)!.push(contract);
              }
            });
          }
        } catch (err) {
          // Ignorar erros individuais
        }
      }));

      console.log(`[getProcessesForExport]   Vinculados ${Math.min(i + concurrencyLimitContracts, allContracts.length)}/${allContracts.length} contratos`);
    }

    console.log(`[getProcessesForExport] Total contratos: ${allContracts.length} | Processos com contratos: ${contractsByProcess.size}`);

    // 3. Buscar despesas em paralelo (controle de concorrência: 20 por vez)
    console.log('[getProcessesForExport] 3/4 Buscando despesas em paralelo...');
    const expensesByProcess = new Map<number, any[]>();
    const concurrencyLimit = 20;

    for (let i = 0; i < allProcesses.length; i += concurrencyLimit) {
      const batch = allProcesses.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (process: any) => {
        try {
          const priCod = Number(process.priCod);
          const despesas = await this.getDespesasByProcessId(String(priCod));
          const rows = Array.isArray(despesas) ? despesas : (despesas?.rows || []);
          if (rows.length > 0) {
            expensesByProcess.set(priCod, rows);
          }
        } catch (err) {
          // Ignora erros individuais
        }
      });
      await Promise.all(batchPromises);
      console.log(`[getProcessesForExport]   Processados ${Math.min(i + concurrencyLimit, allProcesses.length)}/${allProcesses.length}`);
    }
    console.log(`[getProcessesForExport] Processos com despesas: ${expensesByProcess.size}`);

    // 4. Filtrar processos que têm contrato OU encargo + enriquecer dados
    console.log('[getProcessesForExport] 4/4 Filtrando e enriquecendo processos...');
    const processesForExport: any[] = [];
    const excluded: any[] = [];

    for (const process of allProcesses) {
      const priCod = Number(process.priCod);
      const contracts = contractsByProcess.get(priCod) || [];
      const expenses = expensesByProcess.get(priCod) || [];

      const hasEncargos = expenses.some((d: any) =>
        (d.ctpDesNome || d.impDesNome || '').toUpperCase() === 'ENCARGOS FINANCEIROS'
      );

      // Incluir se tem contrato OU encargo
      if (contracts.length > 0 || hasEncargos) {
        // Buscar payments/titles apenas para processos com contratos
        let payments: any[] = [];
        if (contracts.length > 0) {
          try {
            const financialTitles = await this.getFinancialTitlesPsq015(priCod, filCod);
            // Buscar baixas para cada título
            const titlesWithDischarges = await Promise.all(
              financialTitles.map(async (title: any) => {
                const discharges = await this.getTitleDischargesPsq015(title, filCod);
                return { ...title, discharges };
              })
            );
            payments = titlesWithDischarges;
          } catch (err) {
            console.warn(`[getProcessesForExport] Erro ao buscar payments do processo ${priCod}:`, err);
          }
        }

        processesForExport.push({
          ...process,
          contracts,
          payments,
          expenses,
        });
      } else {
        excluded.push(priCod);
      }
    }

    console.log(`[getProcessesForExport] ✓ Incluídos: ${processesForExport.length} processos`);
    console.log(`[getProcessesForExport] ✗ Excluídos (sem contrato nem encargo): ${excluded.length} processos`);
    if (excluded.length > 0 && excluded.length <= 10) {
      console.log(`[getProcessesForExport]   priCods excluídos: ${excluded.join(', ')}`);
    }

    // 5. Validar docCods na com297 (apenas documentos FINALIZADOS da tela de Contratos de Câmbio)
    console.log('[getProcessesForExport] 5/5 Validando docCods na com297...');
    const allDocCods: number[] = [];
    for (const proc of processesForExport) {
      for (const title of (proc.payments || [])) {
        if (title.docCod != null) allDocCods.push(Number(title.docCod));
      }
    }
    const uniqueDocCods = [...new Set(allDocCods)];

    let validDocCods: Set<number>;
    if (uniqueDocCods.length > 0) {
      validDocCods = await this.getValidDocCodesFromCom297(uniqueDocCods, filCod);
    } else {
      validDocCods = new Set();
    }

    // Filtrar payments de cada processo para conter apenas docCods válidos da com297
    let totalFiltrados = 0;
    for (const proc of processesForExport) {
      const antes = (proc.payments || []).length;
      proc.payments = (proc.payments || []).filter((t: any) => {
        if (t.docCod == null) return false; // sem docCod: excluir
        return validDocCods.has(Number(t.docCod));
      });
      const depois = proc.payments.length;
      const filtrados = antes - depois;
      if (filtrados > 0) {
        console.log(`[getProcessesForExport]   Processo ${proc.priCod}: ${filtrados} título(s) removido(s) por não estar na com297`);
        totalFiltrados += filtrados;
      }
    }
    console.log(`[getProcessesForExport] com297: ${totalFiltrados} título(s) filtrado(s) no total`);

    console.log('★★★ FIM EXPORT ★★★\n');

    return { processes: processesForExport };
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
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    try {
      const resp = await this.client.post(url, body, { headers });
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
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
    };

    const url = `/log009/${invCod}`;
    try {
      const resp = await this.client.get(url, { headers });
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

  /**
   * Consulta duplicatas em cmn019 com retry automático em 401.
   * Retorna as rows cruas para extração flexível dos campos.
   */
  private async getCmn019DuplicatasRows(
    filterList: Record<string, any>,
    pageSize = 100,
    traceLabel = 'cmn019'
  ): Promise<any[]> {
    await this.ensureSid();

    const body = {
      fieldList: [],
      filterList,
      pageNumber: 1,
      pageSize,
      orderList: { orderList: [{ propertyName: 'dupEspOrdem', order: 'asc' }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/cmn019/duplicatas/list';
    try {
      if (DEBUG_VERBOSE) {
        console.log(`[${traceLabel}] POST ${url} filter=${JSON.stringify(filterList)} pageSize=${pageSize}`);
      }
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || [];
      if (DEBUG_VERBOSE) {
        const sample = rows.slice(0, 3).map((r: any) => ({
          pgtCod: r?.pgtCod,
          pesCod: r?.pesCod,
          dpeNomPessoa: r?.dpeNomPessoa,
          dupNumDiasVcto: r?.dupNumDiasVcto,
          dupEspOrdem: r?.dupEspOrdem,
        }));
        console.log(`[${traceLabel}] rows=${rows.length} sample=${JSON.stringify(sample)}`);
      }
      return rows;
    } catch (err: any) {
      if (err.response?.status === 401) {
        if (DEBUG_VERBOSE) {
          console.log(`[${traceLabel}] 401 recebido em ${url}; tentando relogar...`);
        }
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        const rows = retryResp.data?.rows || [];
        if (DEBUG_VERBOSE) {
          const sample = rows.slice(0, 3).map((r: any) => ({
            pgtCod: r?.pgtCod,
            pesCod: r?.pesCod,
            dpeNomPessoa: r?.dpeNomPessoa,
            dupNumDiasVcto: r?.dupNumDiasVcto,
            dupEspOrdem: r?.dupEspOrdem,
          }));
          console.log(`[${traceLabel}] retry rows=${rows.length} sample=${JSON.stringify(sample)}`);
        }
        return rows;
      }
      console.error(`[${traceLabel}] Erro ao listar duplicatas:`, err.message);
      return [];
    }
  }

  /**
   * Resolve pgtCod da pessoa via cmn019/duplicatas/list.
   * Estratégia:
   * 1) busca por nome completo usando LIKE;
   * 2) fallback por substrings do nome (3 palavras, 2 palavras, 1 palavra relevante).
   */
  async resolvePgtCodByPerson(personName?: string | null): Promise<number | null> {
    if (DEBUG_VERBOSE) {
      console.log(`[cmn019.resolvePgtCodByPerson] start personName="${personName || ''}"`);
    }

    const trimmedName = (personName || '').trim();
    if (!trimmedName) return null;

    const words = trimmedName
      .split(/\s+/)
      .map(w => w.replace(/[^\p{L}\p{N}]/gu, '').trim())
      .filter(Boolean);

    const candidates: string[] = [];
    candidates.push(trimmedName);
    if (words.length >= 3) candidates.push(words.slice(0, 3).join(' '));
    if (words.length >= 2) candidates.push(words.slice(0, 2).join(' '));
    const significantWord = words.find(w => w.length >= 4);
    if (significantWord) candidates.push(significantWord);

    const uniqueCandidates = Array.from(new Set(candidates.map(c => c.trim()).filter(Boolean)));

    for (const candidate of uniqueCandidates) {
      const rowsByName = await this.getCmn019DuplicatasRows({ 'dpeNomPessoa#LIKE': `%${candidate}%` }, 50, `cmn019.byName(${candidate})`);
      const pgtByName = rowsByName.find((r: any) => r?.pgtCod != null)?.pgtCod;
      if (DEBUG_VERBOSE) {
        console.log(`[cmn019.resolvePgtCodByPerson] query="%${candidate}%" pgtCod=${pgtByName ?? 'null'}`);
      }
      if (pgtByName != null) return Number(pgtByName);
    }

    return null;
  }

  /**
   * Busca prazo padrão de faturamento em dias via pgtCod.
   * Campo alvo: dupNumDiasVcto (rows do cmn019/duplicatas/list).
   */
  async getBillingTermDaysByPgtCod(pgtCod: number): Promise<number | null> {
    if (!pgtCod || !Number.isFinite(Number(pgtCod))) return null;
    const rows = await this.getCmn019DuplicatasRows({ 'pgtCod#EQ': String(pgtCod) }, 100, 'cmn019.byPgtCod');
    const firstValid = rows.find((r: any) => r?.dupNumDiasVcto != null);
    if (!firstValid) {
      if (DEBUG_VERBOSE) {
        console.log(`[cmn019.getBillingTermDaysByPgtCod] pgtCod=${pgtCod} sem dupNumDiasVcto válido`);
      }
      return null;
    }
    const days = Number(firstValid.dupNumDiasVcto);
    if (DEBUG_VERBOSE) {
      console.log(`[cmn019.getBillingTermDaysByPgtCod] pgtCod=${pgtCod} dupNumDiasVctoRaw=${firstValid.dupNumDiasVcto} parsed=${days}`);
    }
    return Number.isFinite(days) && days >= 0 ? days : null;
  }

  /**
   * Resolve prazo padrão de faturamento em dias para o cliente.
   * Retorna null quando não houver dados suficientes.
   */
  async getClientBillingTermDays(params: {
    pgtCod?: number | null;
    personName?: string | null;
  }): Promise<number | null> {
    if (DEBUG_VERBOSE) {
      console.log(`[cmn019.getClientBillingTermDays] input pgtCod=${params.pgtCod ?? 'null'} personName="${params.personName || ''}"`);
    }
    const directPgtCod = params.pgtCod && Number.isFinite(Number(params.pgtCod))
      ? Number(params.pgtCod)
      : null;

    const resolvedPgtCod = directPgtCod ?? await this.resolvePgtCodByPerson(params.personName ?? null);
    if (!resolvedPgtCod) return null;

    const days = await this.getBillingTermDaysByPgtCod(resolvedPgtCod);
    if (DEBUG_VERBOSE) {
      console.log(`[cmn019.getClientBillingTermDays] resolved person="${params.personName || ''}" pgtCod=${resolvedPgtCod} prazoDias=${days ?? 'null'}`);
    }
    return days;
  }

  async getFinancialTitlesPsq015(priCod: number, filCod: number = config.conexos.filCod) {
    if (!priCod) return [];
    await this.ensureSid();

    const body = {
      fieldList: [
        "filCod", "priCod", "priEspRefcliente", "docCod", "titDtaVencimento", "pesCod",
        "dpeNomPessoa", "ungDesNome", "titMnyValor", "titMnyJuros", "titMnyDesconto",
        "mnyLiquido", "mnyTaxas", "bxaMnyValor", "bxaMnyRetido", "bxaMnyLiquido",
        "vlrJurosProj", "vlrMultaProj", "mnyAberto", "mnyAbertoAgrup", "docMnyValor",
        "titEspNumero", "docDtaEmissao", "titCod", "docEspNumero", "dplDesNome",
        "docVldTipoAdto", "tpdDesNome", "docTip", "docVldTipoFisFin"
      ],
      filterList: {
        "fExibirRenegociados#EQ": "0",
        "fExibirAgrupados#EQ": "0",
        "fPriCod#EQ": priCod,
        "vldSituacao#IN": ["1", "2"],
        "docVldPrevisao#EQ": "0",
        "filCod#IN": [filCod]
      },
      pageNumber: 1,
      pageSize: "50",
      dtoParam: {},
      serviceName: "psq015",
      orderList: { orderList: [{ propertyName: "filCod", order: "asc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/psq015/list';
    try {
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || [];
      if (priCod === 82) {
        if (DEBUG_VERBOSE) console.log(`[DEBUG 82] psq015: ${rows.length} títulos encontrados`);
        rows.forEach((r: any, i: number) => {
          if (DEBUG_VERBOSE) console.log(`[DEBUG 82] Título ${i + 1}: titCod=${r.titCod}, docCod=${r.docCod}, vencimento=${r.titDtaVencimento}, numero=${r.titEspNumero}`);
        });
      }
      return rows;
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

  async getTitleDischargesPsq015(title: any, filCod: number = config.conexos.filCod) {
    if (!title || !title.filCod || !title.docCod || !title.titCod) return [];

    await this.ensureSid();

    // Usa filCod do título (já vem correto) ou usa o parâmetro como fallback
    const effectiveFilCod = title.filCod || filCod;

    const docTip = title.docTip ?? 1;
    // URL: /api/psq015/baixasTitulo/list/{filCod}/{docTip}/{docCod}/{titCod}/{vldCheck}
    // vldCheck é sempre 0 conforme instrução do usuário
    const url = `/psq015/baixasTitulo/list/${effectiveFilCod}/${docTip}/${title.docCod}/${title.titCod}/0`;

    const body = {
      fieldList: [],
      filterList: { "borVldFinalizado#IN": [1] },
      pageNumber: 1,
      pageSize: 100,
      orderList: { orderList: [{ propertyName: "borCod", order: "asc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(effectiveFilCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    try {
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || (Array.isArray(resp.data) ? resp.data : []);

      // Log específico para priCod 82 se conseguirmos identificar o priCod (passado no title)
      if (title.priCod === 82) {
        if (DEBUG_VERBOSE) console.log(`[DEBUG 82] baixasTitulo para titCod ${title.titCod}: ${rows.length} baixas`);
        rows.forEach((r: any, i: number) => {
          if (DEBUG_VERBOSE) console.log(`[DEBUG 82] Baixa ${i + 1}: borCod=${r.borCod}, borDtaMvto=${r.borDtaMvto}, valor=${r.bxaMnyValor}`);
        });
      }
      return rows;
    } catch (err: any) {
      if (err.response && (err.response.status === 500 || err.response.status === 404)) {
        return [];
      }

      if (err.response && err.response.status === 401) {
        await this.login();
        try {
          const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
          return retryResp.data?.rows || (Array.isArray(retryResp.data) ? retryResp.data : []);
        } catch (retryErr: any) {
          return [];
        }
      }
      return [];
    }
  }

  /**
   * Valida quais docCods existem na com297 com status FINALIZADO (vldStatus=3).
   * Usada para filtrar títulos do psq015, garantindo que apenas documentos
   * originados da tela com_297 (Contratos de Câmbio) sejam incluídos no relatório.
   * @param docCods Lista de docCods a verificar
   * @param filCod Filial
   * @returns Set de docCods válidos; em caso de erro, retorna o set completo (fail-open)
   */
  async getValidDocCodesFromCom297(docCods: number[], filCod: number = config.conexos.filCod): Promise<Set<number>> {
    if (!docCods || docCods.length === 0) return new Set();

    await this.ensureSid();

    const body = {
      fieldList: ["docCod"],
      filterList: {
        "docCod#IN": docCods,
        "vldStatus#IN": ["3"]
      },
      pageNumber: 1,
      pageSize: docCods.length + 10,
      serviceName: "com297",
      orderList: { orderList: [{ propertyName: "docCod", order: "desc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/com297/list';
    try {
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || [];
      const validSet = new Set<number>(rows.map((r: any) => Number(r.docCod)));
      console.log(`[com297] Verificados ${docCods.length} docCods → ${validSet.size} válidos (status FINALIZADO)`);
      return validSet;
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        await this.login();
        try {
          const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
          const rows = retryResp.data?.rows || [];
          return new Set<number>(rows.map((r: any) => Number(r.docCod)));
        } catch (retryErr) {
          console.warn('[com297] Falha no retry - mantendo todos os títulos');
          return new Set(docCods);
        }
      }
      console.warn('[com297] Erro ao verificar docCods - mantendo todos os títulos:', err.message);
      return new Set(docCods); // fail-open: em caso de erro, não filtra
    }
  }

  /**
   * Busca Taxa Ptax D.I da Declaração de Importação
   * Fluxo: POST /imp019/list (filtro priCod) → cdiCod → POST /imp019/impDiPlanilha/list → plcFltTaxaFat
   */
  async getTaxaPtaxDI(priCod: number): Promise<number | null> {
    await this.ensureSid();

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
    };

    try {
      // Step 1: Buscar cdiCod
      const step1Body = {
        fieldList: ["cdiCod"],
        filterList: { "priCod#EQ": priCod, "cdiVldValidproc#EQ": "1" },
        pageNumber: 1,
        pageSize: 1,
        serviceName: "imp019",
        orderList: { orderList: [{ propertyName: "cdiCod", order: "desc" }] }
      };

      const resp1 = await this.client.post('/imp019/list', step1Body, { headers });
      const rows1 = resp1.data?.rows || [];
      if (rows1.length === 0) {
        if (DEBUG_VERBOSE) console.log(`[getTaxaPtaxDI] Nenhuma DI encontrada para priCod ${priCod}`);
        return null;
      }

      const cdiCod = rows1[0].cdiCod;
      if (!cdiCod) {
        if (DEBUG_VERBOSE) console.log(`[getTaxaPtaxDI] cdiCod vazio para priCod ${priCod}`);
        return null;
      }

      if (DEBUG_VERBOSE) console.log(`[getTaxaPtaxDI] priCod ${priCod} → cdiCod ${cdiCod}`);

      // Step 2: Buscar plcFltTaxaFat
      const step2Body = {
        fieldList: ["plcFltTaxaFat"],
        filterList: { "cdiCod": String(cdiCod), "cdiCodSeq": "0" },
        pageNumber: 1,
        pageSize: 1,
        serviceName: "imp019.impDiPlanilha",
      };

      const resp2 = await this.client.post('/imp019/impDiPlanilha/list', step2Body, { headers });
      const rows2 = resp2.data?.rows || [];

      if (rows2.length === 0) {
        if (DEBUG_VERBOSE) console.log(`[getTaxaPtaxDI] Nenhum registro de planilha para cdiCod ${cdiCod}`);
        return null;
      }

      const taxaPtaxDI = Number(rows2[0].plcFltTaxaFat) || null;

      if (DEBUG_VERBOSE) console.log(`[getTaxaPtaxDI] cdiCod ${cdiCod} → Taxa Ptax D.I: ${taxaPtaxDI}`);

      return taxaPtaxDI;
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        return this.getTaxaPtaxDI(priCod);
      }
      console.error(`[getTaxaPtaxDI] Erro ao buscar Taxa Ptax D.I para priCod ${priCod}:`, err.message);
      return null;
    }
  }

  /**
   * Busca data de faturamento (emissão da Invoice/Proforma)
   * Reutiliza métodos existentes: getInvoiceCodeLog009 → getProcessDetailsLog009
   */
  async getDataFaturamento(priCod: number): Promise<string | null> {
    await this.ensureSid();

    const invCod = await this.getInvoiceCodeLog009(priCod);
    if (!invCod) {
      if (DEBUG_VERBOSE) console.log(`[getDataFaturamento] Nenhum invCod para priCod ${priCod}`);
      return null;
    }

    const details = await this.getProcessDetailsLog009(invCod);
    if (!details?.docDtaEmissao) {
      if (DEBUG_VERBOSE) console.log(`[getDataFaturamento] docDtaEmissao não disponível para invCod ${invCod}`);
      return null;
    }

    // Converter timestamp para ISO date
    const emissionDate = new Date(details.docDtaEmissao).toISOString().split('T')[0];

    if (DEBUG_VERBOSE) console.log(`[getDataFaturamento] priCod ${priCod} → Data Faturamento: ${emissionDate}`);

    return emissionDate;
  }

  /**
   * Busca dados enriquecidos de um contrato específico incluindo:
   * - Dados básicos do contrato (imp059)
   * - Taxa Ptax D.I (imp019)
   * - Data de faturamento (log009)
   * @param imcCod Código do contrato
   * @param priCod Código do processo (para buscar dados relacionados)
   */
  async getEnrichedContractData(imcCod: number, priCod: number): Promise<any> {
    await this.ensureSid();

    // Buscar contrato base
    const contracts = await this.getContractsByProcess(priCod);
    const contract = contracts.find((c: any) => c.imcCod === imcCod);

    if (!contract) {
      throw new Error(`Contrato ${imcCod} não encontrado para processo ${priCod}`);
    }

    // Buscar dados adicionais em paralelo
    const [taxaPtaxDI, dataFaturamento] = await Promise.all([
      this.getTaxaPtaxDI(priCod),
      this.getDataFaturamento(priCod),
    ]);

    return {
      ...contract,
      // Dados enriquecidos
      taxaPtaxDI,
      dataFaturamento,
      // Campos calculados
      isAVista: contract.imcFltTxFec && contract.imcFltTxFec > 0,
      isAPrazo: !contract.imcFltTxFec || contract.imcFltTxFec === 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // V2: Fluxo baseado em Notas Fiscais (com297 → com311 → com017)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Lista notas fiscais de saída (com297) vinculadas a um processo.
   * Opcionalmente filtra por cliente (pesCod).
   */
  async listInvoicesByProcess(priCod: number, pesCod?: number, filCod: number = config.conexos.filCod) {
    if (!priCod) return [];
    await this.ensureSid();

    const filterList: Record<string, any> = {
      "priCod#EQ": priCod,
      "vldStatus#IN": ["1", "2", "3", "7"],
    };
    if (pesCod) {
      filterList["pesCod#EQ"] = pesCod;
    }

    const body = {
      fieldList: [
        "docCod", "priCod", "priEspRefcliente", "docDtaEmissao", "docEspNumero",
        "docVldTipoAdto", "tpdDesNome", "pesCod", "dpeNomPessoa", "ufEspSigla",
        "mnyBruto", "docMnyValor", "vldStatus", "filCod", "docTip"
      ],
      filterList,
      pageNumber: 1,
      pageSize: 200,
      serviceName: "com297",
      orderList: { orderList: [{ propertyName: "docCod", order: "desc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/com297/list';
    try {
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || [];
      if (DEBUG_VERBOSE) console.log(`[com297] priCod=${priCod}: ${rows.length} NFs encontradas`);
      return rows;
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data?.rows || [];
      }
      console.error(`[com297] Erro ao listar NFs para priCod ${priCod}:`, err.message);
      return [];
    }
  }

  /**
   * Verifica se processo possui pelo menos uma NF FINALIZADA na com297 (vldStatus=3).
   */
  async hasFinalizedInvoiceByProcess(priCod: number, filCod: number = config.conexos.filCod) {
    if (!priCod) return false;
    await this.ensureSid();

    const body = {
      fieldList: ['docCod'],
      filterList: {
        'priCod#EQ': priCod,
        'vldStatus#EQ': '3',
      },
      pageNumber: 1,
      pageSize: 1,
      serviceName: 'com297',
      orderList: { orderList: [{ propertyName: 'docCod', order: 'desc' }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = '/com297/list';
    try {
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || [];
      return rows.length > 0;
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        const rows = retryResp.data?.rows || [];
        return rows.length > 0;
      }
      console.error(`[com297] Erro ao verificar NF finalizada do processo ${priCod}:`, err.message);
      return false;
    }
  }

  /**
   * Busca títulos financeiros de uma nota fiscal (com311).
   * Retorna rows + summary (totalVlr, totalVlrPago).
   */
  async getTitlesByInvoice(docCod: number, filCod: number = config.conexos.filCod) {
    if (!docCod) return { rows: [], summary: { totalVlr: 0, totalVlrPago: 0 } };
    await this.ensureSid();

    const body = {
      fieldList: [
        "titCod", "dupEspOrdem", "titEspNumero", "titDtaVencOriginal",
        "titDtaVencimento", "titMnyValor", "pago", "titDtaPrevisao",
        "titMnyTotPago", "titVldStatus", "filCod", "docTip", "docCod",
        "tciCod", "titFltTaxaMneg", "titMnyValorMneg", "moeCodMneg",
        "moeEspNome", "gerNumJuros", "gerDesJuros", "gerNumDesconto",
        "gerDesDesconto", "vldBordero"
      ],
      filterList: { "titVldStatus#EQ": "1" },
      pageNumber: 1,
      pageSize: 100,
      serviceName: "com311.finTituloFin",
      orderList: { orderList: [{ propertyName: "titCod", order: "asc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = `/com311/list/${docCod}`;
    try {
      const resp = await this.client.post(url, body, { headers });
      return {
        rows: resp.data?.rows || [],
        summary: resp.data?.summary || { totalVlr: 0, totalVlrPago: 0 },
      };
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return {
          rows: retryResp.data?.rows || [],
          summary: retryResp.data?.summary || { totalVlr: 0, totalVlrPago: 0 },
        };
      }
      console.error(`[com311] Erro ao buscar títulos para docCod ${docCod}:`, err.message);
      return { rows: [], summary: { totalVlr: 0, totalVlrPago: 0 } };
    }
  }

  /**
   * Busca detalhamento de duplicata (composição) de um título financeiro.
   * Endpoint: POST /com311/detalDuplicata/list/{docCod}/{titCod}
   * Retorna as linhas de composição (FOB, FRETE INTERNACIONAL, etc.)
   */
  async getDetalDuplicata(docCod: number, titCod: number, filCod: number = config.conexos.filCod) {
    if (!docCod || !titCod) return [];
    await this.ensureSid();

    const body = {
      fieldList: [],
      filterList: {},
      pageNumber: 1,
      pageSize: 50,
      orderList: { orderList: [{ propertyName: "ftdNumOrdem", order: "asc" }] }
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = `/com311/detalDuplicata/list/${docCod}/${titCod}`;
    try {
      const resp = await this.client.post(url, body, { headers });
      const rows = resp.data?.rows || [];
      if (DEBUG_VERBOSE) console.log(`[com311/detalDuplicata] docCod=${docCod} titCod=${titCod}: ${rows.length} linhas`);
      return rows;
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        const retryResp = await this.client.post(url, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data?.rows || [];
      }
      console.error(`[com311/detalDuplicata] Erro docCod=${docCod} titCod=${titCod}:`, err.message);
      return [];
    }
  }

  /**
   * Busca encargos gerais de uma nota fiscal (com017).
   * Retorna impostos, despesas, encargosGerais, resumo, totalProdutos.
   */
  async getEncargosGeraisByInvoice(docTip: number, docCod: number, filCod: number = config.conexos.filCod) {
    if (!docCod) return null;
    await this.ensureSid();

    const headers = {
      ...this.getAuthHeaders(),
      'cnx-filcod': String(filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const url = `/com017/encargosGerais/${docTip}/${docCod}/${filCod}/1/1`;
    try {
      const resp = await this.client.get(url, { headers });
      if (DEBUG_VERBOSE) console.log(`[com017] encargosGerais docCod=${docCod}: despesas=${resp.data?.despesas?.length || 0}`);
      return resp.data;
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        const retryResp = await this.client.get(url, { headers: { ...headers, ...this.getAuthHeaders() } });
        return retryResp.data;
      }
      console.error(`[com017] Erro ao buscar encargos para docCod ${docCod}:`, err.message);
      return null;
    }
  }

  /**
   * V2: Exportação baseada em NFs.
   * Fluxo: contratos (imp059) → processos → NFs (com297) → títulos (com311) + encargos (com017)
   *
   * Retorna dados estruturados hierarquicamente:
   *   processo → contratos → notas fiscais → { títulos, encargos }
   */
  async getProcessesForExportV2(filCod: number = config.conexos.filCod) {
    await this.ensureSid();

    console.log(`\n★★★ EXPORT V2 (NFs) — Filial ${filCod} ★★★`);

    // 1. Buscar contratos e vincular a processos (mesma lógica da V1)
    console.log('[ExportV2] 1/4 Buscando contratos de câmbio...');
    const allContracts = await this.getContracts(filCod);
    console.log(`[ExportV2] Contratos encontrados: ${allContracts.length}`);

    const contractsByProcess = new Map<number, any[]>();
    const allPriCods = new Set<number>();
    const concurrency = 20;

    for (let i = 0; i < allContracts.length; i += concurrency) {
      const batch = allContracts.slice(i, i + concurrency);
      await Promise.all(batch.map(async (contract: any) => {
        if (!contract.imcCod) return;
        try {
          const relatedProcs = await this.getProcessesByContractId(contract.imcCod, filCod);
          if (relatedProcs?.length > 0) {
            relatedProcs.forEach((rp: any) => {
              if (rp.priCod) {
                const priCod = Number(rp.priCod);
                allPriCods.add(priCod);
                if (!contractsByProcess.has(priCod)) contractsByProcess.set(priCod, []);
                contractsByProcess.get(priCod)!.push(contract);
              }
            });
          }
        } catch (_) { /* ignora erros individuais */ }
      }));
      console.log(`[ExportV2]   Vinculados ${Math.min(i + concurrency, allContracts.length)}/${allContracts.length} contratos`);
    }

    const distinctPriCods = Array.from(allPriCods);
    console.log(`[ExportV2] Processos com contratos: ${distinctPriCods.length}`);
    console.log(`[ExportV2] priCods encontrados (filial ${filCod}): [${distinctPriCods.join(', ')}]`);

    if (distinctPriCods.length === 0) {
      console.log('★★★ FIM EXPORT V2 (sem processos) ★★★\n');
      return { processes: [] };
    }

    // 2. Buscar dados dos processos (imp021)
    console.log('[ExportV2] 2/4 Buscando dados dos processos (imp021)...');
    const processes = await this.getProcesses({ priCodIn: distinctPriCods, dateFrom: '2026-01-01' }, filCod);
    console.log(`[ExportV2] Processos recuperados (priDtaAbertura >= 2026-01-01): ${processes.length}`);
    if (processes.length > 0) {
      console.log(`[ExportV2] filCods nos dados retornados: [${[...new Set(processes.map((p: any) => p.filCod))].join(', ')}]`);
    }

    // 3. Para cada processo, buscar NFs (com297)
    console.log('[ExportV2] 3/4 Buscando NFs para cada processo (com297)...');
    const processResults: any[] = [];

    for (let i = 0; i < processes.length; i += concurrency) {
      const batch = processes.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(async (proc: any) => {
        const priCod = Number(proc.priCod);
        const contracts = contractsByProcess.get(priCod) || [];
        const invoices = await this.listInvoicesByProcess(priCod, undefined, filCod);

        return {
          ...proc,
          contracts,
          invoices,
        };
      }));
      processResults.push(...batchResults);
      console.log(`[ExportV2]   NFs buscadas para ${Math.min(i + concurrency, processes.length)}/${processes.length} processos`);
    }

    // 4. Para cada NF, buscar títulos (com311) + encargos (com017) em paralelo
    console.log('[ExportV2] 4/4 Enriquecendo NFs com títulos (com311) e encargos (com017)...');
    let totalInvoices = 0;
    let enrichedCount = 0;

    for (const proc of processResults) {
      totalInvoices += (proc.invoices || []).length;
    }

    // Enriquecer NFs de todos os processos em paralelo (batches de concurrency)
    const allInvoiceJobs = processResults.flatMap((proc) =>
      (proc.invoices || []).map((inv: any) => ({ proc, inv }))
    );

    for (let i = 0; i < allInvoiceJobs.length; i += concurrency) {
      const batch = allInvoiceJobs.slice(i, i + concurrency);
      const enriched = await Promise.all(batch.map(async ({ proc, inv }) => {
        const docCod = Number(inv.docCod);
        const docTip = inv.docTip ?? 1;
        const invFilCod = inv.filCod ?? filCod;

        const [titlesData, encargos] = await Promise.all([
          this.getTitlesByInvoice(docCod, invFilCod),
          this.getEncargosGeraisByInvoice(docTip, docCod, invFilCod),
        ]);

        // Buscar data de baixa (borDtaMvto) + detalDuplicata (composição FOB) para cada título
        const titlesWithDetails = await Promise.all(
          (titlesData.rows || []).map(async (title: any) => {
            let enrichedTitle = { ...title };

            // Baixas (psq015) para títulos pagos
            if (title.pago === 1 || title.pago === 2) {
              try {
                const discharges = await this.getTitleDischargesPsq015(title, invFilCod);
                if (discharges && discharges.length > 0) {
                  discharges.sort((a: any, b: any) => {
                    const dA = new Date(a.borDtaMvto || 0).getTime();
                    const dB = new Date(b.borDtaMvto || 0).getTime();
                    return dB - dA;
                  });
                  enrichedTitle.borDtaMvto = discharges[0].borDtaMvto;
                }
              } catch (_) { /* ignora erros individuais */ }
            }

            // Detalhamento de duplicata (com311/detalDuplicata) — composição do título
            try {
              const duplicatas = await this.getDetalDuplicata(docCod, title.titCod, invFilCod);
              enrichedTitle.duplicatas = duplicatas;
              const fobEntry = duplicatas.find((d: any) =>
                (d.impDesNome || '').toUpperCase() === 'FOB' && d.ftdVldAcao === 1
              );
              if (fobEntry) {
                enrichedTitle.fobValue = Number(fobEntry.ftdMnyValor);
                enrichedTitle.fobImpCod = fobEntry.impCod;
              }
            } catch (_) { /* ignora erros individuais */ }

            return enrichedTitle;
          })
        );

        enrichedCount++;

        return {
          proc,
          enrichedInv: {
            ...inv,
            titles: titlesWithDetails,
            titlesSummary: titlesData.summary,
            encargos,
          },
        };
      }));

      // Atribuir NFs enriquecidas de volta aos processos
      for (const { proc, enrichedInv } of enriched) {
        if (!proc._enrichedInvoices) proc._enrichedInvoices = [];
        proc._enrichedInvoices.push(enrichedInv);
      }
    }

    // Substituir invoices originais pelas enriquecidas
    for (const proc of processResults) {
      if (proc._enrichedInvoices) {
        proc.invoices = proc._enrichedInvoices;
        delete proc._enrichedInvoices;
      }
    }

    console.log(`[ExportV2] NFs enriquecidas: ${enrichedCount}/${totalInvoices}`);
    console.log(`[ExportV2] ✓ Total: ${processResults.length} processos, ${totalInvoices} NFs`);
    console.log('★★★ FIM EXPORT V2 ★★★\n');

    return { processes: processResults };
  }

  /**
   * Busca o total de "Valor a Permutar" (mnyTitPermutar) da com299 para todos os adiantamentos.
   * Estratégia: list retorna apenas docCod; para cada docCod, GET /com299/{docCod} e soma rows[0].mnyTitPermutar.
   */
  async getValorPermutar(): Promise<number> {
    await this.ensureSid();

    const baseURL = this.client.defaults.baseURL || 'https://columbiatrading.conexos.cloud/api';
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    console.log('[com299] ─── ETAPA 1: list (apenas docCod) ───');

    const docCods: number[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const listBody = {
        fieldList: ['docCod'],
        filterList: {
          'docVldTipoAdto#EQ': '1',
          'vldStatus#IN': ['1', '3'],
        },
        pageNumber: page,
        pageSize,
        serviceName: 'com299',
        orderList: { orderList: [{ propertyName: 'docCod', order: 'desc' }] },
      };

      console.log(`[com299] List pág ${page}:`, JSON.stringify(listBody, null, 2));

      let rows: any[] = [];
      let count = 0;
      try {
        const resp = await this.client.post('/com299/list', listBody, { headers });
        rows = resp.data?.rows || resp.data?.data?.rows || [];
        count = resp.data?.count ?? resp.data?.data?.count ?? rows.length;
        console.log(`[com299] List pág ${page}: count=${count}, rows=${rows.length}`);
      } catch (err: any) {
        if (err.response?.status === 401) {
          await this.login();
          const retryResp = await this.client.post('/com299/list', listBody, { headers: { ...headers, ...this.getAuthHeaders() } });
          rows = retryResp.data?.rows || retryResp.data?.data?.rows || [];
          count = retryResp.data?.count ?? retryResp.data?.data?.count ?? rows.length;
        } else {
          console.error('[com299] Erro no list:', err.message, 'Status:', err.response?.status, 'Data:', JSON.stringify(err.response?.data || {}));
          throw err;
        }
      }

      for (const row of rows) {
        const cod = row.docCod ?? row.doccod;
        if (cod != null) docCods.push(Number(cod));
      }

      if (rows.length < pageSize || page * pageSize >= count) break;
      page++;
    }

    console.log(`[com299] docCods coletados: ${docCods.length}`, docCods.slice(0, 5).join(', ') + (docCods.length > 5 ? '...' : ''));

    if (docCods.length === 0) {
      console.log('[com299] ─── RESULTADO valor-permutar ─── total: 0 (nenhum docCod)');
      return 0;
    }

    console.log('[com299] ─── ETAPA 2: GET /com299/{docCod} para cada registro ───');

    let total = 0;
    for (let i = 0; i < docCods.length; i++) {
      const docCod = docCods[i];
      try {
        const getResp = await this.client.get(`/com299/${docCod}`, { headers });
        const getRows = getResp.data?.rows ?? getResp.data?.data?.rows;
        const row0 = Array.isArray(getRows) && getRows.length > 0 ? getRows[0] : getResp.data;
        const valor = Number(row0?.mnyTitPermutar ?? 0);
        total += valor;
        if (DEBUG_VERBOSE || (i < 3)) {
          console.log(`[com299] GET /com299/${docCod}: mnyTitPermutar=${valor}`);
        }
      } catch (err: any) {
        if (err.response?.status === 401) {
          await this.login();
          const retryResp = await this.client.get(`/com299/${docCod}`, { headers: { ...headers, ...this.getAuthHeaders() } });
          const getRows = retryResp.data?.rows ?? retryResp.data?.data?.rows;
          const row0 = Array.isArray(getRows) && getRows.length > 0 ? getRows[0] : retryResp.data;
          total += Number(row0?.mnyTitPermutar ?? 0);
        } else {
          console.error(`[com299] Erro GET /com299/${docCod}:`, err.message, 'Status:', err.response?.status);
          // continua para próximo docCod em vez de falhar tudo
        }
      }
    }

    console.log('[com299] ─── RESULTADO valor-permutar ─── total:', total);
    return total;
  }

  /**
   * Lista todos os registros com299 de adiantamentos (docVldTipoAdto=1) com colunas financeiras.
   * Retorna array com priCod para vincular ao processo.
   */
  async getCom299List(): Promise<Array<{
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
  }>> {
    await this.ensureSid();

    const baseURL = this.client.defaults.baseURL || 'https://columbiatrading.conexos.cloud/api';
    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const docEntries: Array<{ docCod: number; priCod: number }> = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const listBody = {
        fieldList: ['docCod', 'priCod'],
        filterList: {
          'docVldTipoAdto#EQ': '1',
          'vldStatus#IN': ['1', '3'],
        },
        pageNumber: page,
        pageSize,
        serviceName: 'com299',
        orderList: { orderList: [{ propertyName: 'docCod', order: 'desc' }] },
      };

      let rows: any[] = [];
      let count = 0;
      try {
        const resp = await this.client.post('/com299/list', listBody, { headers });
        rows = resp.data?.rows || resp.data?.data?.rows || [];
        count = resp.data?.count ?? resp.data?.data?.count ?? rows.length;
      } catch (err: any) {
        if (err.response?.status === 401) {
          await this.login();
          const retryResp = await this.client.post('/com299/list', listBody, { headers: { ...headers, ...this.getAuthHeaders() } });
          rows = retryResp.data?.rows || retryResp.data?.data?.rows || [];
          count = retryResp.data?.count ?? retryResp.data?.data?.count ?? rows.length;
        } else {
          throw err;
        }
      }

      for (const row of rows) {
        const cod = row.docCod ?? row.doccod;
        const pri = row.priCod ?? row.pricod;
        if (cod != null) docEntries.push({ docCod: Number(cod), priCod: Number(pri ?? 0) });
      }

      if (rows.length < pageSize || page * pageSize >= count) break;
      page++;
    }

    const result: Array<{
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
    }> = [];

    for (const entry of docEntries) {
      try {
        const [getResp, baixaDate] = await Promise.all([
          this.client.get(`/com299/${entry.docCod}`, { headers }),
          this.getCom309Baixas(entry.docCod),
        ]);
        const getRows = getResp.data?.rows ?? getResp.data?.data?.rows;
        const row0 = Array.isArray(getRows) && getRows.length > 0 ? getRows[0] : getResp.data;
        if (!row0) continue;

        result.push({
          docCod: entry.docCod,
          priCod: entry.priCod || Number(row0.priCod ?? 0),
          mnyBruto: Number(row0.mnyBruto ?? 0),
          mnyAcrescimo: Number(row0.mnyAcrescimo ?? 0),
          mnyDesconto: Number(row0.mnyDesconto ?? 0),
          mnyTitValor: Number(row0.mnyTitValor ?? 0),
          mnyTitPago: Number(row0.mnyTitPago ?? 0),
          mnyTitPermuta: Number(row0.mnyTitPermuta ?? 0),
          mnyTitAberto: Number(row0.mnyTitAberto ?? 0),
          mnyTitPermutar: Number(row0.mnyTitPermutar ?? 0),
          docDtaEmissao: row0.docDtaEmissao ?? null,
          borDtaFinalizado: baixaDate,
        });
      } catch (err: any) {
        if (err.response?.status === 401) {
          await this.login();
          const [retryResp, baixaDate] = await Promise.all([
            this.client.get(`/com299/${entry.docCod}`, { headers: { ...headers, ...this.getAuthHeaders() } }),
            this.getCom309Baixas(entry.docCod),
          ]);
          const getRows = retryResp.data?.rows ?? retryResp.data?.data?.rows;
          const row0 = Array.isArray(getRows) && getRows.length > 0 ? getRows[0] : retryResp.data;
          if (row0) {
            result.push({
              docCod: entry.docCod,
              priCod: entry.priCod || Number(row0.priCod ?? 0),
              mnyBruto: Number(row0.mnyBruto ?? 0),
              mnyAcrescimo: Number(row0.mnyAcrescimo ?? 0),
              mnyDesconto: Number(row0.mnyDesconto ?? 0),
              mnyTitValor: Number(row0.mnyTitValor ?? 0),
              mnyTitPago: Number(row0.mnyTitPago ?? 0),
              mnyTitPermuta: Number(row0.mnyTitPermuta ?? 0),
              mnyTitAberto: Number(row0.mnyTitAberto ?? 0),
              mnyTitPermutar: Number(row0.mnyTitPermutar ?? 0),
              docDtaEmissao: row0.docDtaEmissao ?? null,
              borDtaFinalizado: baixaDate,
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Busca a data de finalização (borDtaFinalizado) das baixas de um documento com299.
   * Endpoint: POST /com309/baixas/list/{docCod}/1/0
   * Retorna a data da última baixa finalizada, ou null se não houver.
   */
  async getCom309Baixas(docCod: number): Promise<string | null> {
    await this.ensureSid();

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
      'cnx-datalanguage': 'pt',
      'accept': 'application/json, text/plain, */*',
    };

    const body = {
      fieldList: [],
      filterList: { 'borVldFinalizado#IN': [1] },
      pageNumber: 1,
      pageSize: 100,
      orderList: { orderList: [{ propertyName: 'borCod', order: 'asc' }] },
    };

    try {
      const resp = await this.client.post(`/com309/baixas/list/${docCod}/1/0`, body, { headers });
      const rows = resp.data?.rows || resp.data?.data?.rows || [];
      if (rows.length === 0) return null;
      // Última baixa finalizada (ordenado por borCod asc → último = mais recente)
      const lastRow = rows[rows.length - 1];
      return lastRow?.borDtaFinalizado ?? null;
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        const retryResp = await this.client.post(`/com309/baixas/list/${docCod}/1/0`, body, { headers: { ...headers, ...this.getAuthHeaders() } });
        const rows = retryResp.data?.rows || retryResp.data?.data?.rows || [];
        if (rows.length === 0) return null;
        const lastRow = rows[rows.length - 1];
        return lastRow?.borDtaFinalizado ?? null;
      }
      console.error(`[com309] Erro ao buscar baixas para docCod=${docCod}:`, err.message);
      return null;
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
      impCod: config.conexos.impCod,
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
      ctpCod: config.conexos.ctpCod,
      prdDesNome: null,
      prdCod: null,
      pidMnyValormn: Number(valorBRL.toFixed(2)),
      pidMnyValorMneg: Number(valorBRL.toFixed(2)),
      filCod: String(config.conexos.filCod)
    };

    const headers = {
      ...this.getAuthHeaders(),
      'content-type': 'application/json;charset=UTF-8',
      'cnx-filcod': String(config.conexos.filCod),
      'cnx-usncod': config.conexos.usnCod,
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
