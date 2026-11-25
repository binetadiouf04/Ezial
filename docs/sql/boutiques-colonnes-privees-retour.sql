-- Retour arrière de boutiques-colonnes-privees.sql : rend à anon la lecture de toutes
-- les colonnes des boutiques (la RLS limite toujours aux boutiques actives).
begin;
revoke select on public.shops from anon;
grant select on public.shops to anon;
commit;
