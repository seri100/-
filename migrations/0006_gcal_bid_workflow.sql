-- Additive migration: preserves all calendar data, legacy status and notes.
CREATE TABLE IF NOT EXISTS gcal_bid_workflow (
  event_id TEXT PRIMARY KEY REFERENCES gcal_bids(event_id),
  workflow_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
