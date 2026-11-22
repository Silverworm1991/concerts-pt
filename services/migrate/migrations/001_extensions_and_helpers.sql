-- Extensions used for accent-insensitive and fuzzy matching of Portuguese names.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is not IMMUTABLE, so it can't be used in generated columns or
-- indexes directly. This wrapper pins the dictionary and declares it immutable.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Canonical search form of a name: lower-case, no accents, single spaces.
-- 'Sétima  Arte' -> 'setima arte'
CREATE OR REPLACE FUNCTION norm_name(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT btrim(regexp_replace(lower(immutable_unaccent($1)), '\s+', ' ', 'g')) $$;

-- Keeps updated_at honest without every service having to remember it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
