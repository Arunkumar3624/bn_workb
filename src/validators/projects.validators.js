import { z } from "zod";

// Mirrors project_status in schema.sql. PATCH /api/projects/:id is for the
// non-terminal FSM steps only — COMPLETED is reachable exclusively through
// POST /api/projects/:id/complete, and FUNDS_SECURED exclusively through
// POST /api/projects/:id/secure-funds, since both routes run atomic ledger
// side effects (schema.sql's chk_ constraints don't enforce transition
// order — that's the API's job, not the DB's).
const PATCHABLE_STATUSES = [
  "ACCEPTED",
  "WORK_IN_PROGRESS",
  "FILES_SUBMITTED",
  "CANCELLED",
  "DISPUTED",
];

// workerId omitted entirely posts an OPEN job board listing (see
// projects.repository.js's create) — the existing direct-invite flow still
// passes a real workerId and behaves exactly as before this feature existed.
export const createProjectSchema = z.object({
  workerId: z.string().uuid().optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  budget: z.number().positive(),
  deadline: z.string().date().optional(), // "YYYY-MM-DD"
});

export const updateProjectStatusSchema = z.object({
  status: z.enum(PATCHABLE_STATUSES),
  // Only meaningful for FILES_SUBMITTED -> WORK_IN_PROGRESS today (the
  // business explaining what needs fixing) — harmless no-op for every
  // other transition, which simply won't pass one.
  note: z.string().trim().max(1000).optional(),
});

export const listProjectsQuerySchema = z.object({
  status: z.string().optional(),
  role: z.enum(["worker", "business"]).optional(), // "list projects where I am this role"
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
