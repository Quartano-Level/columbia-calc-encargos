-- Migration: create app_settings table
-- Date: 2026-02-25

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text        PRIMARY KEY,
  value       text        NOT NULL DEFAULT '',
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Defaults operacionais (Columbia Trading filial 2)
INSERT INTO public.app_settings (key, value, description) VALUES
  ('filial_padrao', '2',   'Filial padrão para consultas Conexos (1–7)'),
  ('fonte_cdi',     'bcb', 'Fonte do CDI: bcb ou conexos'),
  ('cdi_manual',    '',    'CDI manual de fallback em % ao ano (ex: 12.65). Usado quando fonte_cdi=conexos falha.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
