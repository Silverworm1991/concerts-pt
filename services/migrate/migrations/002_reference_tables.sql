-- Where data comes from (ticketline, blueticket, ticketmaster, ...).
CREATE TABLE sources (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]+$'),
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('api', 'scraper', 'manual')),
  base_url    text,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cities (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  name_norm     text GENERATED ALWAYS AS (norm_name(name)) STORED,
  region        text CHECK (region IN ('Norte','Centro','Lisboa','Alentejo','Algarve','Madeira','Açores')),
  country_code  char(2) NOT NULL DEFAULT 'PT',
  latitude      double precision CHECK (latitude  BETWEEN -90  AND 90),
  longitude     double precision CHECK (longitude BETWEEN -180 AND 180),
  -- Mainland and Madeira use Lisbon time rules; the Azores are an hour behind.
  timezone      text NOT NULL DEFAULT 'Europe/Lisbon',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name_norm, country_code)
);

CREATE TABLE venues (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  name_norm   text GENERATED ALWAYS AS (norm_name(name)) STORED,
  city_id     bigint NOT NULL REFERENCES cities(id),
  address     text,
  postal_code text,
  latitude    double precision CHECK (latitude  BETWEEN -90  AND 90),
  longitude   double precision CHECK (longitude BETWEEN -180 AND 180),
  capacity    integer CHECK (capacity > 0),
  website     text,
  -- false = auto-created by a collector and not yet reviewed by a human
  verified    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name_norm, city_id)
);
CREATE INDEX venues_city_idx ON venues (city_id);
CREATE INDEX venues_name_trgm_idx ON venues USING gin (name_norm gin_trgm_ops);

-- Venues get renamed (Pavilhão Atlântico -> Altice Arena -> MEO Arena) and every
-- ticketing site spells them differently. Aliases let the normalizer resolve all of them.
CREATE TABLE venue_aliases (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id    bigint NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  alias_norm  text GENERATED ALWAYS AS (norm_name(alias)) STORED,
  UNIQUE (venue_id, alias_norm)
);
CREATE INDEX venue_aliases_norm_idx ON venue_aliases (alias_norm);

CREATE TABLE artists (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text NOT NULL,
  name_norm       text GENERATED ALWAYS AS (norm_name(name)) STORED,
  musicbrainz_id  uuid UNIQUE,
  country_code    char(2),
  genres          text[] NOT NULL DEFAULT '{}',
  verified        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artists_name_idx ON artists (name_norm);
CREATE INDEX artists_name_trgm_idx ON artists USING gin (name_norm gin_trgm_ops);

CREATE TABLE artist_aliases (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  artist_id   bigint NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  alias_norm  text GENERATED ALWAYS AS (norm_name(alias)) STORED,
  UNIQUE (artist_id, alias_norm)
);
CREATE INDEX artist_aliases_norm_idx ON artist_aliases (alias_norm);

CREATE TRIGGER sources_updated_at  BEFORE UPDATE ON sources  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER cities_updated_at   BEFORE UPDATE ON cities   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER venues_updated_at   BEFORE UPDATE ON venues   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER artists_updated_at  BEFORE UPDATE ON artists  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
