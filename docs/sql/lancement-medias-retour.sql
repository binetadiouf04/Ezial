-- Retour arrière de docs/sql/lancement-medias.sql : supprime seulement l'index
-- ajouté. Aucune donnée touchée. Rejouable.

drop index if exists public.products_active_created_idx;
