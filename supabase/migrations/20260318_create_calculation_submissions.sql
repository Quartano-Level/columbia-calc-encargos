-- Migration: create calculation_submissions table + add submitted_at to calculations
-- Date: 2026-03-18
-- RF-05: Trilha de auditoria da submissão ao Conexos

BEGIN;

-- Coluna submitted_at na tabela calculations (RF-04)
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Tabela de auditoria de submissões
CREATE TABLE IF NOT EXISTS public.calculation_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid REFERENCES public.calculations(id) ON DELETE SET NULL,
  processo_id text NOT NULL,
  submitted_by text,
  request_payload jsonb NOT NULL,
  response_payload jsonb,
  response_status integer,
  conexos_record_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calc_submissions_calculation_id
  ON public.calculation_submissions (calculation_id);
CREATE INDEX IF NOT EXISTS idx_calc_submissions_processo_id
  ON public.calculation_submissions (processo_id);

COMMIT;
