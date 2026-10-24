-- Coordinates come from a geocoder that is queried by the server, never by visitors' browsers.
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS geocode_status TEXT
  CHECK (geocode_status IN ('ok', 'not_found', 'skipped'));
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

-- Rows still to do, and failed rows that are due for a retry.
CREATE INDEX IF NOT EXISTS assemblies_geocode_pending_idx
  ON assemblies (geocoded_at NULLS FIRST) WHERE geocode_status IS NULL OR geocode_status = 'not_found';
CREATE INDEX IF NOT EXISTS assemblies_coords_idx ON assemblies (datum) WHERE lat IS NOT NULL AND lon IS NOT NULL;
