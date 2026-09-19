CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  device_secret TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  subscription_json TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_updated_at ON devices(updated_at);
