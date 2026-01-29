-- 009_cocoa_rate_card_lines_unique.sql
-- Prevent duplicate rate card lines for the same depot + takeover center

create unique index if not exists cocoa_rate_card_lines_unique
  on public.cocoa_rate_card_lines (rate_card_id, depot_id, takeover_center_id);
