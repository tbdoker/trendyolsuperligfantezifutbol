-- The season the app plays. While we build on the free API plan, that is 2024–25 (complete data).
-- When the paid plan starts, add 2026 and switch: update seasons set is_current = (id = 2026);
insert into seasons (id, name, is_current) values (2024, '2024–25', true)
on conflict (id) do nothing;
