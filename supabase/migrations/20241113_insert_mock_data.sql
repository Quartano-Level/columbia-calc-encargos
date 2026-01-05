-- ============================================
-- FINANCE CALCULATOR - DADOS MOCK
-- Versão: 1.0
-- Data: 2024-11-13
-- Descrição: Dados de teste para todas as tabelas
-- ============================================

-- ==================== 1. CLIENTES ====================
-- Inserir 5 clientes de exemplo
INSERT INTO public.clientes (nome, cnpj, email) VALUES
    ('Importadora ABC Ltda', '12345678000195', 'contato@importadoraabc.com.br'),
    ('Comércio Global S.A.', '98765432000123', 'financeiro@comercioglobal.com'),
    ('Trade Master Importações', '11223344000156', 'admin@trademaster.com.br'),
    ('Logística Internacional', '55667788000199', 'importacao@logistica.com.br'),
    ('Distribuidora Nacional', '99887766000144', 'suprimentos@distribuidora.com')
ON CONFLICT (cnpj) DO NOTHING;

-- ==================== 2. TAXAS ====================
-- Inserir taxas dos últimos 5 dias
INSERT INTO public.taxas (tipo, valor, data) VALUES
    -- Hoje
    ('CDI Mensal', 0.95, CURRENT_DATE),
    ('PTAX D-1', 5.10, CURRENT_DATE),
    ('SPOT Compra', 5.08, CURRENT_DATE),
    ('SPOT Venda', 5.12, CURRENT_DATE),
    
    -- Ontem
    ('CDI Mensal', 0.94, CURRENT_DATE - INTERVAL '1 day'),
    ('PTAX D-1', 5.08, CURRENT_DATE - INTERVAL '1 day'),
    ('SPOT Compra', 5.06, CURRENT_DATE - INTERVAL '1 day'),
    ('SPOT Venda', 5.10, CURRENT_DATE - INTERVAL '1 day'),
    
    -- 2 dias atrás
    ('CDI Mensal', 0.96, CURRENT_DATE - INTERVAL '2 days'),
    ('PTAX D-1', 5.12, CURRENT_DATE - INTERVAL '2 days'),
    ('SPOT Compra', 5.10, CURRENT_DATE - INTERVAL '2 days'),
    ('SPOT Venda', 5.14, CURRENT_DATE - INTERVAL '2 days'),
    
    -- 3 dias atrás
    ('CDI Mensal', 0.93, CURRENT_DATE - INTERVAL '3 days'),
    ('PTAX D-1', 5.05, CURRENT_DATE - INTERVAL '3 days'),
    ('SPOT Compra', 5.03, CURRENT_DATE - INTERVAL '3 days'),
    ('SPOT Venda', 5.07, CURRENT_DATE - INTERVAL '3 days'),
    
    -- 4 dias atrás
    ('CDI Mensal', 0.95, CURRENT_DATE - INTERVAL '4 days'),
    ('PTAX D-1', 5.09, CURRENT_DATE - INTERVAL '4 days'),
    ('SPOT Compra', 5.07, CURRENT_DATE - INTERVAL '4 days'),
    ('SPOT Venda', 5.11, CURRENT_DATE - INTERVAL '4 days')
ON CONFLICT (tipo, data) DO NOTHING;

-- ==================== 3. PROCESSOS ====================
-- Inserir 10 processos de exemplo
INSERT INTO public.processos (cliente_id, numero_processo, incoterm, valor_usd, moeda, prazo_dias, cdi_am, data_vencimento, status, descricao) VALUES
    (1, '2024-001-IMP', 'FOB', 500000.00, 'USD', 90, 0.95, CURRENT_DATE + INTERVAL '90 days', 'pending', 'Importação de Soja em Grãos - 1000 TN'),
    (1, '2024-002-IMP', 'CIF', 750000.00, 'USD', 120, 0.95, CURRENT_DATE + INTERVAL '120 days', 'calculating', 'Importação de Milho - 1500 TN'),
    (2, '2024-003-IMP', 'FOB', 300000.00, 'USD', 60, 0.95, CURRENT_DATE + INTERVAL '60 days', 'approved', 'Importação de Trigo - 600 TN'),
    (2, '2024-004-IMP', 'FOB', 1200000.00, 'USD', 180, 0.95, CURRENT_DATE + INTERVAL '180 days', 'pending', 'Importação de Fertilizantes - 2000 TN'),
    (3, '2024-005-IMP', 'EXW', 450000.00, 'USD', 90, 0.95, CURRENT_DATE + INTERVAL '90 days', 'completed', 'Importação de Máquinas Agrícolas'),
    (3, '2024-006-IMP', 'FOB', 680000.00, 'USD', 90, 0.95, CURRENT_DATE + INTERVAL '90 days', 'pending', 'Importação de Químicos - 800 TN'),
    (4, '2024-007-IMP', 'CIF', 920000.00, 'USD', 150, 0.95, CURRENT_DATE + INTERVAL '150 days', 'calculating', 'Importação de Eletrônicos'),
    (4, '2024-008-IMP', 'FOB', 550000.00, 'USD', 90, 0.95, CURRENT_DATE + INTERVAL '90 days', 'approved', 'Importação de Componentes - 1100 TN'),
    (5, '2024-009-IMP', 'FOB', 380000.00, 'USD', 75, 0.95, CURRENT_DATE + INTERVAL '75 days', 'pending', 'Importação de Plásticos - 500 TN'),
    (5, '2024-010-IMP', 'CIF', 890000.00, 'USD', 120, 0.95, CURRENT_DATE + INTERVAL '120 days', 'pending', 'Importação de Têxteis - 1200 TN')
ON CONFLICT (numero_processo) DO NOTHING;

-- ==================== 4. CENÁRIOS ====================
-- Inserir 3 cenários por processo (cenário base + 2 alternativas)
INSERT INTO public.cenarios (processo_id, nome, descricao, status) VALUES
    -- Processo 1
    (1, 'Cenário Base', 'Cálculo padrão com taxas atuais', 'active'),
    (1, 'Cenário Otimista', 'CDI reduzido em 0.2%', 'active'),
    (1, 'Cenário Pessimista', 'CDI aumentado em 0.3%', 'active'),
    
    -- Processo 2
    (2, 'Cenário Base', 'Cálculo padrão com taxas atuais', 'active'),
    (2, 'Cenário Com Créditos', 'Incluindo todos os créditos fiscais', 'active'),
    (2, 'Cenário Sem Créditos', 'Sem aproveitamento de créditos', 'active'),
    
    -- Processo 3
    (3, 'Cenário Base', 'Cálculo padrão', 'active'),
    (3, 'Cenário Alongamento', 'Com alongamento de prazo', 'archived'),
    
    -- Processo 4
    (4, 'Cenário Base', 'Cálculo padrão', 'active'),
    
    -- Processo 5
    (5, 'Cenário Base', 'Cálculo padrão', 'active')
ON CONFLICT DO NOTHING;

-- ==================== 5. FATURAMENTO ====================
-- Inserir dados de faturamento para os primeiros 5 processos
INSERT INTO public.faturamento (
    processo_id, produto, quantidade_tn, procedencia, ncm, declaracao_importacao,
    fob_total_usd, fob_unitario_usd, frete_total_usd, frete_unitario_usd,
    seguro_total_usd, seguro_unitario_usd, valor_cif_usd, cif_unitario_usd,
    valor_cif_brl, tx_spot_compra, tx_ptax_di, tx_futura_venc, taxa_dolar_fiscal,
    aliq_ii, aliq_ipi, aliq_pis, aliq_cofins, aliq_icms,
    valor_ii, valor_ipi, valor_pis, valor_cofins, valor_icms, total_impostos,
    credito_ipi, credito_pis, credito_cofins, credito_icms, total_creditos,
    frete_nacional, desconto_comercial, despachante_aduaneiro, emissao_di,
    custo_desembaraco, despesas_diversas, custo_comercializacao, total_despesas_operacionais
) VALUES
    -- Processo 1: Soja
    (1, 'Soja em Grãos', 1000.00, 'Argentina', '12019000', 'DI-2024-001',
     500000.00, 500.00, 25000.00, 25.00, 5000.00, 5.00, 530000.00, 530.00,
     2692400.00, 5.08, 0.0095, 5.0895, 5.08,
     0.00, 2.60, 2.10, 9.65, 12.00,
     0.00, 69992.40, 56540.40, 259796.60, 425680.32, 812009.72,
     -69992.40, -56540.40, -259796.60, -425680.32, -812009.72,
     2000.00, 5000.00, 4200.00, 1350.00,
     4200.00, 1350.00, 1820.00, 8920.00),
    
    -- Processo 2: Milho
    (2, 'Milho em Grãos', 1500.00, 'Estados Unidos', '10059000', 'DI-2024-002',
     750000.00, 500.00, 45000.00, 30.00, 8000.00, 5.33, 803000.00, 535.33,
     4079240.00, 5.08, 0.0095, 5.0895, 5.08,
     0.00, 2.60, 2.10, 9.65, 12.00,
     0.00, 106061.24, 85664.04, 393646.86, 645216.48, 1230588.62,
     -106061.24, -85664.04, -393646.86, -645216.48, -1230588.62,
     3500.00, 8000.00, 4200.00, 1350.00,
     4200.00, 1350.00, 1820.00, 7120.00),
    
    -- Processo 3: Trigo
    (3, 'Trigo em Grãos', 600.00, 'Canadá', '10011900', 'DI-2024-003',
     300000.00, 500.00, 18000.00, 30.00, 3500.00, 5.83, 321500.00, 535.83,
     1633220.00, 5.08, 0.0095, 5.0895, 5.08,
     0.00, 2.60, 2.10, 9.65, 12.00,
     0.00, 42463.72, 34297.62, 157575.73, 258211.92, 492548.99,
     0.00, 0.00, 0.00, 0.00, 0.00,
     1800.00, 3000.00, 4200.00, 1350.00,
     4200.00, 1350.00, 1820.00, 5520.00),
    
    -- Processo 4: Fertilizantes
    (4, 'Fertilizantes NPK', 2000.00, 'Rússia', '31051000', 'DI-2024-004',
     1200000.00, 600.00, 80000.00, 40.00, 15000.00, 7.50, 1295000.00, 647.50,
     6578600.00, 5.08, 0.0095, 5.0895, 5.08,
     6.00, 2.60, 2.10, 9.65, 12.00,
     394716.00, 181068.37, 138150.60, 634805.19, 1040214.61, 2388954.77,
     -181068.37, -138150.60, -634805.19, 0.00, -953024.16,
     5000.00, 15000.00, 4200.00, 1350.00,
     4200.00, 1350.00, 1820.00, 2920.00),
    
    -- Processo 5: Máquinas
    (5, 'Máquinas Agrícolas', 50.00, 'Alemanha', '84335200', 'DI-2024-005',
     450000.00, 9000.00, 35000.00, 700.00, 7000.00, 140.00, 492000.00, 9840.00,
     2499360.00, 5.08, 0.0095, 5.0895, 5.08,
     14.00, 0.00, 2.10, 9.65, 12.00,
     349910.40, 0.00, 52486.56, 241168.24, 395108.16, 1038673.36,
     0.00, -52486.56, -241168.24, 0.00, -293654.80,
     4500.00, 0.00, 4200.00, 1350.00,
     4200.00, 1350.00, 1820.00, 11420.00)
ON CONFLICT DO NOTHING;

-- ==================== 6. CUSTOS FINANCEIROS ====================
-- Inserir custos financeiros calculados para os cenários base
INSERT INTO public.custos_financeiros (
    processo_id, cenario_id, variacao_cambial, encargos_financiamento, encargos_alongamento,
    total_encargos, custo_total_importacao, custo_entrada_liquido, custo_unitario_tn,
    margem_contribuicao, preco_venda_sem_impostos, impostos_venda, preco_venda_com_impostos, preco_unitario_tn
) VALUES
    -- Processo 1 - Cenário 1
    (1, 1, 23750.00, 119480.00, 0.00, 155920.00, 3669249.72, 2857240.00, 2857.24, 15.00, 3361458.82, 311494.88, 3672953.70, 3672.95),
    
    -- Processo 2 - Cenário 4
    (2, 4, 38250.00, 298680.00, 0.00, 349280.00, 5665228.62, 4434640.00, 2956.43, 15.00, 5217223.53, 483196.43, 5700419.96, 3800.28),
    
    -- Processo 3 - Cenário 7
    (3, 7, 9650.00, 91440.00, 0.00, 113960.00, 2244748.99, 1752200.00, 2920.33, 18.00, 2136829.27, 197939.51, 2334768.78, 3891.28),
    
    -- Processo 4 - Cenário 9
    (4, 9, 61200.00, 546960.00, 0.00, 620110.00, 10010584.77, 9057560.61, 4528.78, 12.00, 10292682.51, 953478.64, 11246161.15, 5623.08),
    
    -- Processo 5 - Cenário 10
    (5, 10, 22275.00, 128835.00, 0.00, 169775.00, 3718808.36, 3425153.56, 68503.07, 20.00, 4281442.95, 396693.78, 4678136.73, 93562.73)
ON CONFLICT DO NOTHING;

-- ==================== 7. MOVIMENTOS ====================
-- Inserir movimentos de fluxo de caixa para o cenário 1 (Processo 1)
INSERT INTO public.movimentos (cenario_id, data, historico, dias_corridos, tx_spot, valor_usd, encargos, total) VALUES
    (1, CURRENT_DATE + INTERVAL '90 days', 'Pagamento FOB ao Fornecedor', 90, 5.08, 500000.00, 119480.00, 2659480.00),
    (1, CURRENT_DATE + INTERVAL '97 days', 'Pagamento Frete + Seguro', 97, 5.08, 30000.00, 0.00, 152400.00),
    (1, CURRENT_DATE + INTERVAL '105 days', 'Pagamento de Impostos (II + IPI + PIS + COFINS + ICMS)', 105, 0.00, 0.00, 0.00, 812009.72),
    (1, CURRENT_DATE + INTERVAL '110 days', 'Despesas Operacionais', 110, 0.00, 0.00, 0.00, 8920.00),
    
    -- Movimentos para cenário 4 (Processo 2)
    (4, CURRENT_DATE + INTERVAL '120 days', 'Pagamento FOB ao Fornecedor', 120, 5.08, 750000.00, 298680.00, 4108680.00),
    (4, CURRENT_DATE + INTERVAL '127 days', 'Pagamento Frete + Seguro', 127, 5.08, 53000.00, 0.00, 269240.00),
    (4, CURRENT_DATE + INTERVAL '135 days', 'Pagamento de Impostos', 135, 0.00, 0.00, 0.00, 1230588.62),
    
    -- Movimentos para cenário 7 (Processo 3)
    (7, CURRENT_DATE + INTERVAL '60 days', 'Pagamento FOB ao Fornecedor', 60, 5.08, 300000.00, 91440.00, 1615440.00),
    (7, CURRENT_DATE + INTERVAL '67 days', 'Pagamento Frete + Seguro', 67, 5.08, 21500.00, 0.00, 109220.00),
    (7, CURRENT_DATE + INTERVAL '75 days', 'Pagamento de Impostos', 75, 0.00, 0.00, 0.00, 492548.99)
ON CONFLICT DO NOTHING;

-- ==================== 8. PAGAMENTOS ====================
-- Inserir cronograma de pagamentos para os processos
INSERT INTO public.pagamentos (processo_id, tipo, data_vencimento, valor_usd, valor_brl, pago, descricao) VALUES
    -- Processo 1
    (1, 'TED Internacional', CURRENT_DATE + INTERVAL '90 days', 500000.00, 2540000.00, false, 'Pagamento FOB ao fornecedor'),
    (1, 'Câmbio Pronto', CURRENT_DATE + INTERVAL '97 days', 30000.00, 152400.00, false, 'Pagamento de Frete e Seguro'),
    
    -- Processo 2
    (2, 'TED Internacional', CURRENT_DATE + INTERVAL '120 days', 750000.00, 3810000.00, false, 'Pagamento FOB'),
    (2, 'ACC - Adiantamento', CURRENT_DATE + INTERVAL '60 days', 375000.00, 1905000.00, false, 'Antecipação 50%'),
    (2, 'Câmbio Pronto', CURRENT_DATE + INTERVAL '127 days', 53000.00, 269240.00, false, 'Frete e Seguro'),
    
    -- Processo 3
    (3, 'TED Internacional', CURRENT_DATE + INTERVAL '60 days', 300000.00, 1524000.00, true, 'Pagamento FOB - PAGO'),
    (3, 'Câmbio Pronto', CURRENT_DATE + INTERVAL '67 days', 21500.00, 109220.00, false, 'Frete e Seguro'),
    
    -- Processo 4
    (4, 'ACC - Adiantamento', CURRENT_DATE + INTERVAL '30 days', 600000.00, 3048000.00, false, 'Antecipação 50%'),
    (4, 'TED Internacional', CURRENT_DATE + INTERVAL '180 days', 600000.00, 3048000.00, false, 'Saldo 50%'),
    (4, 'Câmbio Pronto', CURRENT_DATE + INTERVAL '185 days', 95000.00, 482600.00, false, 'Frete e Seguro'),
    
    -- Processo 5
    (5, 'Remessa Internacional', CURRENT_DATE + INTERVAL '90 days', 450000.00, 2286000.00, true, 'Pagamento à vista - PAGO')
ON CONFLICT DO NOTHING;

-- ==================== 9. CONEXOS IMPORTS ====================
-- Inserir logs de importação do Conexos
INSERT INTO public.conexos_imports (processo_id, numero_processo, status, dados_importados, erro) VALUES
    (1, '2024-001-IMP', 'success', 
     '{"fornecedor": "Agro Export SA", "pais_origem": "Argentina", "porto_embarque": "Buenos Aires", "porto_destino": "Santos", "data_embarque": "2024-10-15", "peso_bruto": 1050, "peso_liquido": 1000, "valor_fob": 500000, "moeda": "USD", "incoterm": "FOB"}'::jsonb,
     NULL),
    
    (3, '2024-003-IMP', 'success',
     '{"fornecedor": "Canadian Wheat Co", "pais_origem": "Canada", "porto_embarque": "Vancouver", "porto_destino": "Santos", "data_embarque": "2024-09-20", "peso_bruto": 630, "peso_liquido": 600, "valor_fob": 300000, "moeda": "USD", "incoterm": "FOB"}'::jsonb,
     NULL),
    
    (5, '2024-005-IMP', 'success',
     '{"fornecedor": "German Machines GmbH", "pais_origem": "Germany", "porto_embarque": "Hamburg", "porto_destino": "Santos", "data_embarque": "2024-08-10", "peso_bruto": 55, "peso_liquido": 50, "valor_fob": 450000, "moeda": "USD", "incoterm": "EXW"}'::jsonb,
     NULL),
    
    (NULL, '2024-011-IMP', 'failed',
     NULL,
     'Processo não encontrado no sistema Conexos - timeout após 30s'),
    
    (2, '2024-002-IMP', 'partial',
     '{"fornecedor": "USA Grain Exports", "pais_origem": "USA", "porto_embarque": "New Orleans", "nota": "Alguns campos incompletos"}'::jsonb,
     'Dados parciais - faltam informações de embarque')
ON CONFLICT DO NOTHING;

-- ==================== 10. VERIFICAR DADOS ====================
-- Verificar contagens
DO $$
DECLARE
    v_clientes INTEGER;
    v_processos INTEGER;
    v_taxas INTEGER;
    v_cenarios INTEGER;
    v_faturamento INTEGER;
    v_custos INTEGER;
    v_movimentos INTEGER;
    v_pagamentos INTEGER;
    v_conexos INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_clientes FROM public.clientes;
    SELECT COUNT(*) INTO v_processos FROM public.processos;
    SELECT COUNT(*) INTO v_taxas FROM public.taxas;
    SELECT COUNT(*) INTO v_cenarios FROM public.cenarios;
    SELECT COUNT(*) INTO v_faturamento FROM public.faturamento;
    SELECT COUNT(*) INTO v_custos FROM public.custos_financeiros;
    SELECT COUNT(*) INTO v_movimentos FROM public.movimentos;
    SELECT COUNT(*) INTO v_pagamentos FROM public.pagamentos;
    SELECT COUNT(*) INTO v_conexos FROM public.conexos_imports;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DADOS MOCK INSERIDOS COM SUCESSO';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Clientes: % registros', v_clientes;
    RAISE NOTICE 'Processos: % registros', v_processos;
    RAISE NOTICE 'Taxas: % registros', v_taxas;
    RAISE NOTICE 'Cenários: % registros', v_cenarios;
    RAISE NOTICE 'Faturamento: % registros', v_faturamento;
    RAISE NOTICE 'Custos Financeiros: % registros', v_custos;
    RAISE NOTICE 'Movimentos: % registros', v_movimentos;
    RAISE NOTICE 'Pagamentos: % registros', v_pagamentos;
    RAISE NOTICE 'Conexos Imports: % registros', v_conexos;
    RAISE NOTICE '========================================';
END $$;
