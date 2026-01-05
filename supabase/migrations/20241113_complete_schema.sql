-- ============================================
-- FINANCE CALCULATOR - MIGRAÇÃO COMPLETA
-- Versão: 2.0
-- Data: 2024-11-13
-- Descrição: Schema completo com todas as tabelas e relacionamentos
-- ============================================

-- ==================== 1. HABILITAR EXTENSÕES ====================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== 2. TABELA: clientes ====================
-- Armazena informações dos clientes (importadores)
CREATE TABLE IF NOT EXISTS public.clientes (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(14) UNIQUE NOT NULL,
    email VARCHAR(255),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON public.clientes(cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON public.clientes(nome);

COMMENT ON TABLE public.clientes IS 'Clientes do sistema (importadores)';
COMMENT ON COLUMN public.clientes.cnpj IS 'CNPJ sem formatação (14 dígitos)';

-- ==================== 3. TABELA: processos ====================
-- Processos de importação (núcleo do sistema)
CREATE TABLE IF NOT EXISTS public.processos (
    id BIGSERIAL PRIMARY KEY,
    cliente_id BIGINT REFERENCES public.clientes(id) ON DELETE CASCADE,
    numero_processo VARCHAR(50) UNIQUE NOT NULL,
    incoterm VARCHAR(10) DEFAULT 'FOB' CHECK (incoterm IN ('FOB', 'CIF', 'CFR', 'EXW', 'FCA')),
    valor_usd DECIMAL(15, 2) NOT NULL DEFAULT 0,
    moeda VARCHAR(3) DEFAULT 'USD',
    prazo_dias INTEGER DEFAULT 0,
    cdi_am DECIMAL(8, 4) DEFAULT 0,
    data_vencimento DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'calculating', 'approved', 'completed', 'cancelled')),
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_processos_cliente ON public.processos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_processos_numero ON public.processos(numero_processo);
CREATE INDEX IF NOT EXISTS idx_processos_status ON public.processos(status);
CREATE INDEX IF NOT EXISTS idx_processos_data_venc ON public.processos(data_vencimento);

COMMENT ON TABLE public.processos IS 'Processos de importação';
COMMENT ON COLUMN public.processos.incoterm IS 'Termo de comércio internacional';
COMMENT ON COLUMN public.processos.valor_usd IS 'Valor FOB em dólares';
COMMENT ON COLUMN public.processos.prazo_dias IS 'Prazo de pagamento em dias';
COMMENT ON COLUMN public.processos.cdi_am IS 'Taxa CDI ao mês em %';

-- ==================== 4. TABELA: pagamentos ====================
-- Cronograma de pagamentos de cada processo
CREATE TABLE IF NOT EXISTS public.pagamentos (
    id BIGSERIAL PRIMARY KEY,
    processo_id BIGINT REFERENCES public.processos(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    data_vencimento DATE NOT NULL,
    valor_usd DECIMAL(15, 2) NOT NULL DEFAULT 0,
    valor_brl DECIMAL(15, 2) DEFAULT 0,
    pago BOOLEAN DEFAULT FALSE,
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pagamentos_processo ON public.pagamentos(processo_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_data ON public.pagamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pago ON public.pagamentos(pago);

COMMENT ON TABLE public.pagamentos IS 'Cronograma de pagamentos dos processos';
COMMENT ON COLUMN public.pagamentos.tipo IS 'Tipo de pagamento (TED Internacional, Câmbio Pronto, etc.)';

-- ==================== 5. TABELA: taxas ====================
-- Taxas e parâmetros cambiais (CDI, PTAX, SPOT)
CREATE TABLE IF NOT EXISTS public.taxas (
    id BIGSERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('CDI Mensal', 'PTAX D-1', 'SPOT Compra', 'SPOT Venda', 'Futura')),
    valor DECIMAL(12, 6) NOT NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_taxas_tipo ON public.taxas(tipo);
CREATE INDEX IF NOT EXISTS idx_taxas_data ON public.taxas(data);
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxas_tipo_data ON public.taxas(tipo, data);

COMMENT ON TABLE public.taxas IS 'Taxas cambiais e financeiras diárias';
COMMENT ON COLUMN public.taxas.tipo IS 'Tipo de taxa (CDI, PTAX, SPOT, etc.)';
COMMENT ON COLUMN public.taxas.valor IS 'Valor da taxa (% ou R$/USD)';
COMMENT ON COLUMN public.taxas.data IS 'Data de referência da taxa';

-- ==================== 6. TABELA: cenarios ====================
-- Cenários de cálculo (múltiplos cenários por processo)
CREATE TABLE IF NOT EXISTS public.cenarios (
    id BIGSERIAL PRIMARY KEY,
    processo_id BIGINT REFERENCES public.processos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    concluido_em TIMESTAMP WITH TIME ZONE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cenarios_processo ON public.cenarios(processo_id);
CREATE INDEX IF NOT EXISTS idx_cenarios_status ON public.cenarios(status);

COMMENT ON TABLE public.cenarios IS 'Cenários de simulação de cálculo';

-- ==================== 7. TABELA: faturamento ====================
-- Dados de faturamento (detalhes da operação)
CREATE TABLE IF NOT EXISTS public.faturamento (
    id BIGSERIAL PRIMARY KEY,
    processo_id BIGINT REFERENCES public.processos(id) ON DELETE CASCADE,
    produto VARCHAR(255),
    quantidade_tn DECIMAL(12, 4) DEFAULT 0,
    procedencia VARCHAR(100),
    ncm VARCHAR(8),
    declaracao_importacao VARCHAR(50),
    
    -- Custos Diretos (USD)
    fob_total_usd DECIMAL(15, 2) DEFAULT 0,
    fob_unitario_usd DECIMAL(15, 4) DEFAULT 0,
    frete_total_usd DECIMAL(15, 2) DEFAULT 0,
    frete_unitario_usd DECIMAL(15, 4) DEFAULT 0,
    seguro_total_usd DECIMAL(15, 2) DEFAULT 0,
    seguro_unitario_usd DECIMAL(15, 4) DEFAULT 0,
    
    -- Valor C.I.F.
    valor_cif_usd DECIMAL(15, 2) DEFAULT 0,
    cif_unitario_usd DECIMAL(15, 4) DEFAULT 0,
    valor_cif_brl DECIMAL(15, 2) DEFAULT 0,
    
    -- Taxas Cambiais
    tx_spot_compra DECIMAL(8, 4) DEFAULT 0,
    tx_ptax_di DECIMAL(8, 6) DEFAULT 0,
    tx_futura_venc DECIMAL(8, 4) DEFAULT 0,
    taxa_dolar_fiscal DECIMAL(8, 4) DEFAULT 0,
    
    -- Alíquotas de Impostos (%)
    aliq_ii DECIMAL(5, 2) DEFAULT 0,
    aliq_ipi DECIMAL(5, 2) DEFAULT 2.6,
    aliq_pis DECIMAL(5, 2) DEFAULT 2.1,
    aliq_cofins DECIMAL(5, 2) DEFAULT 9.65,
    aliq_icms DECIMAL(5, 2) DEFAULT 0,
    
    -- Valores de Impostos (BRL)
    valor_ii DECIMAL(15, 2) DEFAULT 0,
    valor_ipi DECIMAL(15, 2) DEFAULT 0,
    valor_pis DECIMAL(15, 2) DEFAULT 0,
    valor_cofins DECIMAL(15, 2) DEFAULT 0,
    valor_icms DECIMAL(15, 2) DEFAULT 0,
    total_impostos DECIMAL(15, 2) DEFAULT 0,
    
    -- Créditos Fiscais (BRL)
    credito_ipi DECIMAL(15, 2) DEFAULT 0,
    credito_pis DECIMAL(15, 2) DEFAULT 0,
    credito_cofins DECIMAL(15, 2) DEFAULT 0,
    credito_icms DECIMAL(15, 2) DEFAULT 0,
    total_creditos DECIMAL(15, 2) DEFAULT 0,
    
    -- Despesas Operacionais (BRL)
    frete_nacional DECIMAL(15, 2) DEFAULT 0,
    desconto_comercial DECIMAL(15, 2) DEFAULT 0,
    despachante_aduaneiro DECIMAL(15, 2) DEFAULT 0,
    emissao_di DECIMAL(15, 2) DEFAULT 0,
    custo_desembaraco DECIMAL(15, 2) DEFAULT 4200,
    despesas_diversas DECIMAL(15, 2) DEFAULT 1350,
    custo_comercializacao DECIMAL(15, 2) DEFAULT 1820,
    total_despesas_operacionais DECIMAL(15, 2) DEFAULT 0,
    
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_faturamento_processo ON public.faturamento(processo_id);
CREATE INDEX IF NOT EXISTS idx_faturamento_ncm ON public.faturamento(ncm);

COMMENT ON TABLE public.faturamento IS 'Dados detalhados de faturamento e custos';
COMMENT ON COLUMN public.faturamento.quantidade_tn IS 'Quantidade em toneladas';
COMMENT ON COLUMN public.faturamento.ncm IS 'Nomenclatura Comum do Mercosul (8 dígitos)';
COMMENT ON COLUMN public.faturamento.valor_cif_usd IS 'Cost, Insurance, Freight (FOB + Frete + Seguro)';

-- ==================== 8. TABELA: custos_financeiros ====================
-- Encargos financeiros calculados
CREATE TABLE IF NOT EXISTS public.custos_financeiros (
    id BIGSERIAL PRIMARY KEY,
    processo_id BIGINT REFERENCES public.processos(id) ON DELETE CASCADE,
    cenario_id BIGINT REFERENCES public.cenarios(id) ON DELETE SET NULL,
    
    -- Encargos de Câmbio (BRL)
    variacao_cambial DECIMAL(15, 2) DEFAULT 0,
    encargos_financiamento DECIMAL(15, 2) DEFAULT 0,
    encargos_alongamento DECIMAL(15, 2) DEFAULT 0,
    total_encargos DECIMAL(15, 2) DEFAULT 0,
    
    -- Custo Total
    custo_total_importacao DECIMAL(15, 2) DEFAULT 0,
    custo_entrada_liquido DECIMAL(15, 2) DEFAULT 0,
    custo_unitario_tn DECIMAL(15, 4) DEFAULT 0,
    
    -- Preço de Venda
    margem_contribuicao DECIMAL(5, 2) DEFAULT 15,
    preco_venda_sem_impostos DECIMAL(15, 2) DEFAULT 0,
    impostos_venda DECIMAL(15, 2) DEFAULT 0,
    preco_venda_com_impostos DECIMAL(15, 2) DEFAULT 0,
    preco_unitario_tn DECIMAL(15, 4) DEFAULT 0,
    
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_custos_processo ON public.custos_financeiros(processo_id);
CREATE INDEX IF NOT EXISTS idx_custos_cenario ON public.custos_financeiros(cenario_id);

COMMENT ON TABLE public.custos_financeiros IS 'Encargos financeiros e preço de venda calculados';
COMMENT ON COLUMN public.custos_financeiros.variacao_cambial IS 'Diferença entre Tx Futura e Tx Spot aplicada ao valor USD';
COMMENT ON COLUMN public.custos_financeiros.margem_contribuicao IS 'Margem de lucro em %';

-- ==================== 9. TABELA: movimentos ====================
-- Movimentos de fluxo de caixa (desembolsos)
CREATE TABLE IF NOT EXISTS public.movimentos (
    id BIGSERIAL PRIMARY KEY,
    cenario_id BIGINT REFERENCES public.cenarios(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    historico VARCHAR(255) NOT NULL,
    dias_corridos INTEGER DEFAULT 0,
    tx_spot DECIMAL(8, 4) DEFAULT 0,
    valor_usd DECIMAL(15, 2) DEFAULT 0,
    encargos DECIMAL(15, 2) DEFAULT 0,
    total DECIMAL(15, 2) DEFAULT 0,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_movimentos_cenario ON public.movimentos(cenario_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_data ON public.movimentos(data);

COMMENT ON TABLE public.movimentos IS 'Movimentos de fluxo de caixa projetados';
COMMENT ON COLUMN public.movimentos.dias_corridos IS 'Dias desde o início da operação';

-- ==================== 10. TABELA: conexos_imports ====================
-- Log de importações do sistema Conexos
CREATE TABLE IF NOT EXISTS public.conexos_imports (
    id BIGSERIAL PRIMARY KEY,
    processo_id BIGINT REFERENCES public.processos(id) ON DELETE SET NULL,
    numero_processo VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
    dados_importados JSONB,
    erro TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_conexos_processo ON public.conexos_imports(processo_id);
CREATE INDEX IF NOT EXISTS idx_conexos_status ON public.conexos_imports(status);
CREATE INDEX IF NOT EXISTS idx_conexos_data ON public.conexos_imports(criado_em);

COMMENT ON TABLE public.conexos_imports IS 'Log de importações do Conexos ERP';
COMMENT ON COLUMN public.conexos_imports.dados_importados IS 'Dados JSON importados do Conexos';

-- ==================== 11. TRIGGERS PARA UPDATED_AT ====================
-- Função para atualizar automaticamente updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em todas as tabelas com atualizado_em
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processos_updated_at BEFORE UPDATE ON public.processos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faturamento_updated_at BEFORE UPDATE ON public.faturamento
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custos_updated_at BEFORE UPDATE ON public.custos_financeiros
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== 12. ROW LEVEL SECURITY (RLS) ====================
-- Habilitar RLS em todas as tabelas
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conexos_imports ENABLE ROW LEVEL SECURITY;

-- Políticas: Permitir tudo para service_role (usado pelo n8n)
CREATE POLICY "Allow service_role all" ON public.clientes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.processos
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.pagamentos
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.taxas
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.cenarios
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.faturamento
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.custos_financeiros
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.movimentos
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role all" ON public.conexos_imports
    FOR ALL USING (auth.role() = 'service_role');

-- ==================== 13. DADOS INICIAIS ====================

-- Inserir taxas padrão (exemplo)
INSERT INTO public.taxas (tipo, valor, data) VALUES
    ('CDI Mensal', 0.95, CURRENT_DATE),
    ('PTAX D-1', 5.10, CURRENT_DATE),
    ('SPOT Compra', 5.08, CURRENT_DATE),
    ('SPOT Venda', 5.12, CURRENT_DATE)
ON CONFLICT (tipo, data) DO NOTHING;

-- Cliente de exemplo (opcional)
INSERT INTO public.clientes (nome, cnpj, email) VALUES
    ('Exemplo Importadora Ltda', '12345678000199', 'contato@exemplo.com')
ON CONFLICT (cnpj) DO NOTHING;

-- ==================== 14. VIEWS ÚTEIS ====================

-- View: Processos com informações completas
CREATE OR REPLACE VIEW processos_completos AS
SELECT 
    p.id,
    p.numero_processo,
    p.incoterm,
    p.valor_usd,
    p.status,
    p.data_vencimento,
    c.nome AS cliente_nome,
    c.cnpj AS cliente_cnpj,
    c.email AS cliente_email,
    f.produto,
    f.quantidade_tn,
    f.valor_cif_usd,
    cf.custo_total_importacao,
    cf.preco_venda_com_impostos,
    p.criado_em,
    p.atualizado_em
FROM public.processos p
LEFT JOIN public.clientes c ON p.cliente_id = c.id
LEFT JOIN public.faturamento f ON p.id = f.processo_id
LEFT JOIN public.custos_financeiros cf ON p.id = cf.processo_id;

COMMENT ON VIEW processos_completos IS 'View consolidada de processos com todas as informações';

-- View: Resumo de taxas mais recentes
CREATE OR REPLACE VIEW taxas_atuais AS
SELECT DISTINCT ON (tipo)
    tipo,
    valor,
    data,
    criado_em
FROM public.taxas
ORDER BY tipo, data DESC, criado_em DESC;

COMMENT ON VIEW taxas_atuais IS 'Taxas mais recentes de cada tipo';

-- ==================== 15. FUNÇÕES ÚTEIS ====================

-- Função: Calcular valor C.I.F.
CREATE OR REPLACE FUNCTION calcular_cif(
    p_fob DECIMAL,
    p_frete DECIMAL,
    p_seguro DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
    RETURN p_fob + p_frete + p_seguro;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calcular_cif IS 'Calcula valor C.I.F. (Cost, Insurance, Freight)';

-- Função: Obter taxa atual por tipo
CREATE OR REPLACE FUNCTION obter_taxa_atual(p_tipo VARCHAR)
RETURNS DECIMAL AS $$
DECLARE
    v_valor DECIMAL;
BEGIN
    SELECT valor INTO v_valor
    FROM public.taxas
    WHERE tipo = p_tipo
    ORDER BY data DESC, criado_em DESC
    LIMIT 1;
    
    RETURN COALESCE(v_valor, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION obter_taxa_atual IS 'Obtém o valor mais recente de uma taxa';

-- ==================== 16. GRANTS ====================
-- Garantir permissões para service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ==================== FIM DA MIGRAÇÃO ====================
-- Total de tabelas: 10
-- Total de índices: 27
-- Total de views: 2
-- Total de funções: 3
-- Total de triggers: 4
