-- Migration: add payload_hash column to calculations
-- Date: 2026-03-18
-- RF-10: Hash de integridade do payload

ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS payload_hash text;
