-- Migration: Add pagamento table and seed mock data
-- Created: 2024-01-09

-- Create pagamento table to store payment records
CREATE TABLE IF NOT EXISTS public.pagamento (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  processo_id uuid NOT NULL,
  tipo text NOT NULL, -- 'cambio', 'despesa', etc.
  descricao text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  data_pagamento date NOT NULL,
  data_vencimento date NOT NULL,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT pagamento_pkey PRIMARY KEY (id),
  CONSTRAINT pagamento_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES public.processo(id) ON DELETE CASCADE
);

-- Add index for faster queries by processo_id
CREATE INDEX IF NOT EXISTS idx_pagamento_processo_id ON public.pagamento(processo_id);

-- Add numero_processo column to processo table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'processo' AND column_name = 'numero_processo') THEN
    ALTER TABLE public.processo ADD COLUMN numero_processo text UNIQUE;
  END IF;
END $$;

-- Add status column to processo table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'processo' AND column_name = 'status') THEN
    ALTER TABLE public.processo ADD COLUMN status text DEFAULT 'pending';
  END IF;
END $$;

-- Add moeda column to processo table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'processo' AND column_name = 'moeda') THEN
    ALTER TABLE public.processo ADD COLUMN moeda text DEFAULT 'USD';
  END IF;
END $$;

-- Seed data: Insert clients
INSERT INTO public.cliente (id, nome, cnpj, email, criado_em)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Votorantim S.A.', '12.345.678/0001-90', 'contato@votorantim.com.br', '2024-01-15T10:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 'Level Importação', '98.765.432/0001-10', 'contato@levelimportacao.com.br', '2024-01-16T10:00:00Z')
ON CONFLICT (cnpj) DO NOTHING;

-- Seed data: Insert processes
INSERT INTO public.processo (id, cliente_id, numero_processo, descricao, incoterm, valor_usd, moeda, status, criado_em)
VALUES 
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'ISC-0300001',
    'Processo de importação Votorantim S.A.',
    'FOB',
    486000,
    'USD',
    'pending',
    '2024-01-15T10:00:00Z'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'ISC-0300002',
    'Processo de importação Level',
    'CIF',
    350000,
    'USD',
    'pending',
    '2024-01-16T10:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- Seed data: Insert payments for proc-001
INSERT INTO public.pagamento (id, processo_id, tipo, descricao, valor, data_pagamento, data_vencimento, criado_em)
VALUES 
  (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    'cambio',
    'Pagamento Câmbio',
    300000,
    '2024-01-20',
    '2024-02-15',
    '2024-01-15T10:00:00Z'
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '33333333-3333-3333-3333-333333333333',
    'despesa',
    'Despesas Portuárias',
    15000,
    '2024-01-25',
    '2024-02-15',
    '2024-01-15T10:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- Seed data: Insert payments for proc-002
INSERT INTO public.pagamento (id, processo_id, tipo, descricao, valor, data_pagamento, data_vencimento, criado_em)
VALUES 
  (
    '77777777-7777-7777-7777-777777777777',
    '44444444-4444-4444-4444-444444444444',
    'cambio',
    'Pagamento Câmbio',
    350000,
    '2024-01-22',
    '2024-02-20',
    '2024-01-16T10:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- Add RLS policies for pagamento table
ALTER TABLE public.pagamento ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to authenticated users
CREATE POLICY "Allow read access to pagamento for authenticated users"
  ON public.pagamento
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow insert access to authenticated users
CREATE POLICY "Allow insert access to pagamento for authenticated users"
  ON public.pagamento
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow update access to authenticated users
CREATE POLICY "Allow update access to pagamento for authenticated users"
  ON public.pagamento
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow delete access to authenticated users
CREATE POLICY "Allow delete access to pagamento for authenticated users"
  ON public.pagamento
  FOR DELETE
  TO authenticated
  USING (true);

-- Add comment to table
COMMENT ON TABLE public.pagamento IS 'Stores payment records associated with processes (cambio, despesas, etc.)';
