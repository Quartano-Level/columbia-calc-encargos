-- Migration: add processo_numero and cliente_nome to calculations
-- Date: 2026-03-19
-- Enrich calculations with human-readable process number and client name

BEGIN;

ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS processo_numero text,
  ADD COLUMN IF NOT EXISTS cliente_nome text;

COMMIT;
