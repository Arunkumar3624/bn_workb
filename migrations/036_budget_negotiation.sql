-- Incremental migration — the Post a Job budget was previously fixed and
-- non-negotiable once posted; this lets the assigned worker propose a
-- different figure while the project is still ACCEPTED (before funds are
-- secured — once FUNDS_SECURED, the escrowed amount is locked and this no
-- longer applies). The business explicitly accepts (which overwrites the
-- real budget column) or declines (which just clears the proposal) — never
-- an automatic change.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS proposed_budget NUMERIC(12, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS proposed_by UUID REFERENCES users(id);
