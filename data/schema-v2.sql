CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,
  source_job_id   TEXT NOT NULL,
  source_url      TEXT,
  
  title           TEXT NOT NULL,
  company         TEXT,
  city            TEXT,
  district        TEXT,
  industry        TEXT,
  
  salary_raw      TEXT,
  salary_min      INTEGER,
  salary_max      INTEGER,
  salary_unit     TEXT DEFAULT 'CNY',
  salary_period   TEXT,
  salary_note     TEXT,
  
  experience      TEXT,
  education       TEXT,
  employment_type TEXT,
  
  description     TEXT,
  skills          TEXT,
  requirements    TEXT,
  benefits        TEXT,
  tags            TEXT,
  
  posted_at       TEXT,
  collected_at    TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  
  status          TEXT DEFAULT 'active',
  
  raw_payload     TEXT,
  raw_format      TEXT,
  raw_source      TEXT,
  raw_collected_at TEXT,
  raw_version     TEXT DEFAULT 'v1',
  
  batch_id        TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_identity ON jobs(source, source_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at);
CREATE INDEX IF NOT EXISTS idx_jobs_batch_id ON jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS user_profile (
  id               TEXT PRIMARY KEY DEFAULT 'me',
  name             TEXT,
  phone            TEXT,
  email            TEXT,
  target_role      TEXT,
  target_city      TEXT,
  target_industries TEXT,
  target_salary_min INTEGER,
  target_salary_max INTEGER,
  current_title    TEXT,
  current_company  TEXT,
  current_city     TEXT,
  total_experience TEXT,
  current_skills   TEXT,
  projects         TEXT,
  education        TEXT,
  certificates     TEXT,
  ai_exposure      TEXT,
  ai_engineering_gap TEXT,
  preferences      TEXT,
  note             TEXT,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL,
  ran_at          TEXT DEFAULT (datetime('now')),
  status          TEXT,
  source          TEXT,
  jobs_new        INTEGER DEFAULT 0,
  jobs_updated    INTEGER DEFAULT 0,
  errors          TEXT,
  duration_ms     INTEGER,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_runs_batch_id ON collection_runs(batch_id);

CREATE TABLE IF NOT EXISTS intelligence_cache (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  profile_id      TEXT DEFAULT 'me',
  profile_version TEXT DEFAULT 'v1',
  payload         TEXT NOT NULL,
  markdown        TEXT,
  analysis_type   TEXT,
  analysis_version TEXT DEFAULT 'v1',
  model           TEXT,
  generated_at    TEXT NOT NULL,
  expires_at      TEXT,
  producer        TEXT DEFAULT 'hush-ai-os',
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_intelligence_type ON intelligence_cache(type);
CREATE INDEX IF NOT EXISTS idx_intelligence_profile ON intelligence_cache(profile_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_generated_at ON intelligence_cache(generated_at);
