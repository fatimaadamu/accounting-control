-- 010_ctro_print_tracking.sql
-- Track CTRO print/download events

alter table if exists public.ctro_headers
  add column if not exists printed_at timestamptz,
  add column if not exists printed_by uuid,
  add column if not exists print_count int not null default 0;