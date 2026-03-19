-- Migration: add versioning support to calculations
-- Date: 2026-03-18
-- RF-06: Versionamento e histórico de recálculos

BEGIN;

ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS previous_calculation_id uuid REFERENCES public.calculations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calculations_previous_id
  ON public.calculations (previous_calculation_id);

COMMIT;
