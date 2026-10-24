ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS assemblies_removed_idx ON assemblies (removed_at) WHERE removed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS import_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  source TEXT,
  fetched_count INTEGER,
  new_count INTEGER,
  changed_count INTEGER,
  unchanged_count INTEGER,
  removed_count INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS import_runs_started_idx ON import_runs (started_at DESC);
