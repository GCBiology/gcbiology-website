CREATE TABLE daily_puzzles (
  date DATE PRIMARY KEY,
  seed INTEGER NOT NULL,
  puzzle JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
