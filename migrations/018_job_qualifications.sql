-- Incremental migration — see migrations/013_job_timelines.sql for the
-- same pattern. Real, structured job requirements — "Required Skills" used
-- to just get folded into the description text (see BusinessPostJob.jsx's
-- old onSubmit); experience and education had no representation at all.
-- These are now real columns a job card/detail view can render directly,
-- not text buried in a brief.

ALTER TABLE projects ADD COLUMN min_experience_years SMALLINT CHECK (min_experience_years >= 0);
ALTER TABLE projects ADD COLUMN max_experience_years SMALLINT CHECK (max_experience_years >= 0);

CREATE TYPE education_level AS ENUM ('ANY', 'HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD');
ALTER TABLE projects ADD COLUMN education_level education_level NOT NULL DEFAULT 'ANY';
-- Free-text qualifier alongside the level, e.g. "Computer Science or
-- equivalent" — education requirements vary too much for a fixed enum
-- alone to capture the real ask.
ALTER TABLE projects ADD COLUMN education_notes TEXT;

-- Real tags, not a comma-separated blob inside `description` — a job card
-- can render these directly as chips, and a future "match my skills"
-- search can query them directly instead of parsing free text.
ALTER TABLE projects ADD COLUMN required_skills TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE projects ADD CONSTRAINT chk_experience_range
  CHECK (max_experience_years IS NULL OR min_experience_years IS NULL OR max_experience_years >= min_experience_years);
