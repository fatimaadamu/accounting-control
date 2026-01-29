-- 012_ctro_purity_cert_date.sql
-- Add purity certificate date to CTRO lines

alter table if exists public.ctro_lines
  add column if not exists purity_cert_date date;
