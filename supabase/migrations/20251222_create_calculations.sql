-- Migration: create calculations and calculation_payments tables
-- Date: 2025-12-22

BEGIN;

-- Ensure extension for uuid generation exists (Postgres)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id text NOT NULL,
  cliente_id text,
  payload jsonb NOT NULL,
  total_desembolso numeric(18,2) DEFAULT 0 CHECK (total_desembolso >= 0),
  total_encargos numeric(18,2) DEFAULT 0 CHECK (total_encargos >= 0),
  status text NOT NULL DEFAULT 'calculated',
  version integer NOT NULL DEFAULT 1,
  calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_calculations_processo_id ON public.calculations (processo_id);
CREATE INDEX IF NOT EXISTS idx_calculations_calculated_at ON public.calculations (calculated_at);

CREATE TABLE IF NOT EXISTS public.calculation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid NOT NULL REFERENCES public.calculations(id) ON DELETE CASCADE,
  external_payment_id text,
  tipo text,
  description text,
  value numeric(18,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  due_date date,
  payment_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calculation_payments_calcid ON public.calculation_payments (calculation_id);

-- Optional: lightweight audit table for failures
CREATE TABLE IF NOT EXISTS public.calculation_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid REFERENCES public.calculations(id) ON DELETE SET NULL,
  process_id text,
  error_message text,
  error_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;

-- Note: Run migrations in a test env first. Add any column/migration scripts to your CI pipeline.
