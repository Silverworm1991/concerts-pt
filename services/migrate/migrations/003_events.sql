-- Canonical concert. One row per real-world event once deduplicated.
CREATE TABLE events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title         text NOT NULL,
  kind          text NOT NULL DEFAULT 'concert' CHECK (kind IN ('concert','festival','other')),
  status        text NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','cancelled','postponed','sold_out')),
  venue_id      bigint NOT NULL REFERENCES venues(id),
  -- Always stored in UTC; render in the venue city's timezone.
  start_at      timestamptz NOT NULL,
  end_at        timestamptz,
  doors_at      timestamptz,
  -- Calendar date in the venue's local timezone (set by the normalizer).
  -- A 00:30 show belongs to the previous "concert night"; the normalizer decides.
  local_date    date NOT NULL,
  genres        text[] NOT NULL DEFAULT '{}',
  image_url     text,
  description   text,
  -- Deduplication support (Epic 6): venue + local date + headliner, normalized.
  -- Deliberately NOT unique: matches are probabilistic and need review.
  fingerprint   text,
  -- When two events are found to be the same, the loser points at the winner.
  merged_into   bigint REFERENCES events(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at IS NULL OR end_at >= start_at),
  CHECK (merged_into IS NULL OR merged_into <> id)
);
CREATE INDEX events_start_idx        ON events (start_at) WHERE merged_into IS NULL;
CREATE INDEX events_venue_start_idx  ON events (venue_id, start_at) WHERE merged_into IS NULL;
CREATE INDEX events_local_date_idx   ON events (local_date) WHERE merged_into IS NULL;
CREATE INDEX events_fingerprint_idx  ON events (fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX events_title_trgm_idx   ON events USING gin (norm_name(title) gin_trgm_ops);
CREATE INDEX events_merged_into_idx  ON events (merged_into) WHERE merged_into IS NOT NULL;

CREATE TABLE event_artists (
  event_id     bigint NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  artist_id    bigint NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  position     smallint NOT NULL DEFAULT 0,
  is_headliner boolean NOT NULL DEFAULT false,
  PRIMARY KEY (event_id, artist_id)
);
CREATE INDEX event_artists_artist_idx ON event_artists (artist_id);

CREATE TABLE raw_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id      text NOT NULL REFERENCES sources(id),
  -- The source's own ID for the listing (or its URL if it has no ID).
  external_id    text NOT NULL,
  payload        jsonb NOT NULL,
  -- sha256 of the payload: re-fetching an unchanged listing stores nothing new.
  payload_hash   text NOT NULL,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  process_error  text,
  UNIQUE (source_id, external_id, payload_hash)
);
-- The normalizer's work queue: rows nobody has processed yet.
CREATE INDEX raw_events_unprocessed_idx ON raw_events (fetched_at) WHERE processed_at IS NULL;
CREATE INDEX raw_events_source_external_idx ON raw_events (source_id, external_id, fetched_at DESC);

-- One row per (source, listing): where to buy, for how much.
CREATE TABLE event_offers (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id         bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_id        text   NOT NULL REFERENCES sources(id),
  external_id      text   NOT NULL,
  url              text   NOT NULL,
  -- Money is stored in minor units (cents). NULL = unknown, 0 = free.
  price_min_cents  integer CHECK (price_min_cents >= 0),
  price_max_cents  integer CHECK (price_max_cents >= 0),
  currency         char(3) NOT NULL DEFAULT 'EUR',
  availability     text NOT NULL DEFAULT 'unknown'
                   CHECK (availability IN ('available','low','sold_out','unknown')),
  raw_event_id     bigint REFERENCES raw_events(id) ON DELETE SET NULL,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id),
  CHECK (price_max_cents IS NULL OR price_min_cents IS NULL OR price_max_cents >= price_min_cents)
);
CREATE INDEX event_offers_event_idx ON event_offers (event_id);
-- Lets us find listings that disappeared from a source (possible cancellations).
CREATE INDEX event_offers_last_seen_idx ON event_offers (source_id, last_seen_at);

CREATE TRIGGER events_updated_at       BEFORE UPDATE ON events       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_offers_updated_at BEFORE UPDATE ON event_offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
