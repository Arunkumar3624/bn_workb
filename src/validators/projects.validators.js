import { z } from "zod";

// Mirrors project_status in schema.sql. PATCH /api/projects/:id is for the
// non-terminal FSM steps only — COMPLETED is reachable exclusively through
// POST /api/projects/:id/complete, since only that route runs the atomic
// ledger/wallet side effects (schema.sql's chk_ constraints don't enforce
// transition order — that's the API's job, not the DB's).
const PATCHABLE_STATUSES = [
  "ACCEPTED",
  "FUNDS_SECURED",
  "WORK_IN_PROGRESS",
  "FILES_SUBMITTED",
  "CANCELLED",
  "DISPUTED",
];

export const createProjectSchema = z.object({
  workerId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  budget: z.number().positive(),
  deadline: z.string().date().optional(), // "YYYY-MM-DD"
});

export const updateProjectStatusSchema = z.object({
  status: z.enum(PATCHABLE_STATUSES),
});

export const listProjectsQuerySchema = z.object({
  status: z.string().optional(),
  role: z.enum(["worker", "business"]).optional(), // "list projects where I am this role"
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
