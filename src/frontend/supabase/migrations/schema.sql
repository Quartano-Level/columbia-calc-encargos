-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.calculation_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  calculation_id uuid,
  process_id text,
  error_message text,
  error_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT calculation_errors_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_errors_calculation_id_fkey FOREIGN KEY (calculation_id) REFERENCES public.calculations(id)
);
CREATE TABLE public.calculation_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  calculation_id uuid NOT NULL,
  external_payment_id text,
  tipo text,
  description text,
  value numeric NOT NULL DEFAULT 0 CHECK (value >= 0::numeric),
  due_date date,
  payment_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT calculation_payments_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_payments_calculation_id_fkey FOREIGN KEY (calculation_id) REFERENCES public.calculations(id)
);
CREATE TABLE public.calculations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  processo_id text NOT NULL,
  cliente_id text,
  payload jsonb NOT NULL,
  total_desembolso numeric DEFAULT 0 CHECK (total_desembolso >= 0::numeric),
  total_encargos numeric DEFAULT 0 CHECK (total_encargos >= 0::numeric),
  status text NOT NULL DEFAULT 'calculated'::text,
  version integer NOT NULL DEFAULT 1,
  calculated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT calculations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cenarios (
  id bigint NOT NULL DEFAULT nextval('cenarios_id_seq'::regclass),
  processo_id bigint,
  nome character varying NOT NULL,
  descricao text,
  status character varying DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::character varying, 'archived'::character varying]::text[])),
  criado_em timestamp with time zone DEFAULT now(),
  concluido_em timestamp with time zone,
  CONSTRAINT cenarios_pkey PRIMARY KEY (id),
  CONSTRAINT cenarios_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES public.processos(id)
);
CREATE TABLE public.clientes (
  id bigint NOT NULL DEFAULT nextval('clientes_id_seq'::regclass),
  nome character varying NOT NULL,
  cnpj character varying NOT NULL UNIQUE,
  email character varying,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.conexos_imports (
  id bigint NOT NULL DEFAULT nextval('conexos_imports_id_seq'::regclass),
  processo_id bigint,
  numero_processo character varying NOT NULL,
  status character varying DEFAULT 'success'::character varying CHECK (status::text = ANY (ARRAY['success'::character varying, 'failed'::character varying, 'partial'::character varying]::text[])),
  dados_importados jsonb,
  erro text,
  criado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT conexos_imports_pkey PRIMARY KEY (id),
  CONSTRAINT conexos_imports_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES public.processos(id)
);
CREATE TABLE public.custos_financeiros (
  id bigint NOT NULL DEFAULT nextval('custos_financeiros_id_seq'::regclass),
  processo_id bigint,
  cenario_id bigint,
  variacao_cambial numeric DEFAULT 0,
  encargos_financiamento numeric DEFAULT 0,
  encargos_alongamento numeric DEFAULT 0,
  total_encargos numeric DEFAULT 0,
  custo_total_importacao numeric DEFAULT 0,
  custo_entrada_liquido numeric DEFAULT 0,
  custo_unitario_tn numeric DEFAULT 0,
  margem_contribuicao numeric DEFAULT 15,
  preco_venda_sem_impostos numeric DEFAULT 0,
  impostos_venda numeric DEFAULT 0,
  preco_venda_com_impostos numeric DEFAULT 0,
  preco_unitario_tn numeric DEFAULT 0,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT custos_financeiros_pkey PRIMARY KEY (id),
  CONSTRAINT custos_financeiros_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES public.processos(id),
  CONSTRAINT custos_financeiros_cenario_id_fkey FOREIGN KEY (cenario_id) REFERENCES public.cenarios(id)
);
CREATE TABLE public.faturamento (
  id bigint NOT NULL DEFAULT nextval('faturamento_id_seq'::regclass),
  processo_id bigint,
  produto character varying,
  quantidade_tn numeric DEFAULT 0,
  procedencia character varying,
  ncm character varying,
  declaracao_importacao character varying,
  fob_total_usd numeric DEFAULT 0,
  fob_unitario_usd numeric DEFAULT 0,
  frete_total_usd numeric DEFAULT 0,
  frete_unitario_usd numeric DEFAULT 0,
  seguro_total_usd numeric DEFAULT 0,
  seguro_unitario_usd numeric DEFAULT 0,
  valor_cif_usd numeric DEFAULT 0,
  cif_unitario_usd numeric DEFAULT 0,
  valor_cif_brl numeric DEFAULT 0,
  tx_spot_compra numeric DEFAULT 0,
  tx_ptax_di numeric DEFAULT 0,
  tx_futura_venc numeric DEFAULT 0,
  taxa_dolar_fiscal numeric DEFAULT 0,
  aliq_ii numeric DEFAULT 0,
  aliq_ipi numeric DEFAULT 2.6,
  aliq_pis numeric DEFAULT 2.1,
  aliq_cofins numeric DEFAULT 9.65,
  aliq_icms numeric DEFAULT 0,
  valor_ii numeric DEFAULT 0,
  valor_ipi numeric DEFAULT 0,
  valor_pis numeric DEFAULT 0,
  valor_cofins numeric DEFAULT 0,
  valor_icms numeric DEFAULT 0,
  total_impostos numeric DEFAULT 0,
  credito_ipi numeric DEFAULT 0,
  credito_pis numeric DEFAULT 0,
  credito_cofins numeric DEFAULT 0,
  credito_icms numeric DEFAULT 0,
  total_creditos numeric DEFAULT 0,
  frete_nacional numeric DEFAULT 0,
  desconto_comercial numeric DEFAULT 0,
  despachante_aduaneiro numeric DEFAULT 0,
  emissao_di numeric DEFAULT 0,
  custo_desembaraco numeric DEFAULT 4200,
  despesas_diversas numeric DEFAULT 1350,
  custo_comercializacao numeric DEFAULT 1820,
  total_despesas_operacionais numeric DEFAULT 0,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT faturamento_pkey PRIMARY KEY (id),
  CONSTRAINT faturamento_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES public.processos(id)
);
CREATE TABLE public.movimentos (
  id bigint NOT NULL DEFAULT nextval('movimentos_id_seq'::regclass),
  cenario_id bigint,
  data date NOT NULL,
  historico character varying NOT NULL,
  dias_corridos integer DEFAULT 0,
  tx_spot numeric DEFAULT 0,
  valor_usd numeric DEFAULT 0,
  encargos numeric DEFAULT 0,
  total numeric DEFAULT 0,
  criado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT movimentos_pkey PRIMARY KEY (id),
  CONSTRAINT movimentos_cenario_id_fkey FOREIGN KEY (cenario_id) REFERENCES public.cenarios(id)
);
CREATE TABLE public.pagamentos (
  id bigint NOT NULL DEFAULT nextval('pagamentos_id_seq'::regclass),
  processo_id bigint,
  tipo character varying NOT NULL,
  data_vencimento date NOT NULL,
  valor_usd numeric NOT NULL DEFAULT 0,
  valor_brl numeric DEFAULT 0,
  pago boolean DEFAULT false,
  descricao text,
  criado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT pagamentos_pkey PRIMARY KEY (id),
  CONSTRAINT pagamentos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES public.processos(id)
);
CREATE TABLE public.processos (
  id bigint NOT NULL DEFAULT nextval('processos_id_seq'::regclass),
  cliente_id bigint,
  numero_processo character varying NOT NULL UNIQUE,
  incoterm character varying DEFAULT 'FOB'::character varying CHECK (incoterm::text = ANY (ARRAY['FOB'::character varying, 'CIF'::character varying, 'CFR'::character varying, 'EXW'::character varying, 'FCA'::character varying]::text[])),
  valor_usd numeric NOT NULL DEFAULT 0,
  moeda character varying DEFAULT 'USD'::character varying,
  prazo_dias integer DEFAULT 0,
  cdi_am numeric DEFAULT 0,
  data_vencimento date,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'calculating'::character varying, 'approved'::character varying, 'completed'::character varying, 'cancelled'::character varying]::text[])),
  descricao text,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT processos_pkey PRIMARY KEY (id),
  CONSTRAINT processos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
);
CREATE TABLE public.taxas (
  id bigint NOT NULL DEFAULT nextval('taxas_id_seq'::regclass),
  tipo character varying NOT NULL CHECK (tipo::text = ANY (ARRAY['CDI Mensal'::character varying, 'PTAX D-1'::character varying, 'SPOT Compra'::character varying, 'SPOT Venda'::character varying, 'Futura'::character varying]::text[])),
  valor numeric NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  criado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT taxas_pkey PRIMARY KEY (id)
);