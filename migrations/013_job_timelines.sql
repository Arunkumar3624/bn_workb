-- Incremental migration — see migrations/012_gamification_foundation.sql
-- for the same pattern. Appended to schema.sql so a fresh `npm run migrate`
-- still gets this in one pass.
--
-- Job posting Timelines & Availability Windows. Distinct from the
-- existing `deadline` column (the DELIVERY date once work starts) —
-- application_deadline is when an OPEN post stops accepting new
-- applicants, and estimated_duration is a free-text expectation of how
-- long the work itself should take once a worker is assigned (e.g. "3
-- Days", "2 Weeks"), shown on job cards so a worker knows the shape of
-- the commitment before applying.
ALTER TABLE projects ADD COLUMN application_deadline TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN estimated_duration TEXT;
