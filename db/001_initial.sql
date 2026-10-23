CREATE TABLE IF NOT EXISTS assemblies (
  id BIGSERIAL PRIMARY KEY,
  external_key TEXT NOT NULL UNIQUE,
  datum DATE NOT NULL,
  von TIME,
  bis TIME,
  thema TEXT NOT NULL DEFAULT '',
  plz TEXT,
  strasse_nr TEXT,
  aufzugsstrecke TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  route_points JSONB,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_start DATE,
  recurring_end DATE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_at TIMESTAMPTZ,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('german', coalesce(thema, ''))
  ) STORED
);

CREATE INDEX IF NOT EXISTS assemblies_datum_idx ON assemblies (datum);
CREATE INDEX IF NOT EXISTS assemblies_plz_idx ON assemblies (plz);
CREATE INDEX IF NOT EXISTS assemblies_strasse_idx ON assemblies USING GIN (to_tsvector('german', coalesce(strasse_nr, '') || ' ' || coalesce(aufzugsstrecke, '')));
CREATE INDEX IF NOT EXISTS assemblies_search_idx ON assemblies USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS assembly_history (
  id BIGSERIAL PRIMARY KEY,
  assembly_id BIGINT NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diff JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS assembly_history_assembly_idx ON assembly_history (assembly_id, changed_at DESC);
