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
//
// applicationWindow/estimatedDuration were read by createProject
// (projects.controller.js) and written by projects.repository.js's create,
// but were never actually declared here — z.object().parse() silently
// strips any key not in the schema, so both fields were being dropped
// before the controller ever saw them. Every job post's Application Window
// and Estimated Duration have been silently discarded since they were
// built; adding them here is what actually makes them persist.
export const createProjectSchema = z.object({
  workerId: z.string().uuid().optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  budget: z.number().positive(),
  deadline: z.string().date().optional(), // "YYYY-MM-DD"
  applicationWindow: z.coerce.number().int().min(1).max(90).optional(),
  estimatedDuration: z.string().max(50).optional(),
  // Real, structured job requirements (see migrations/018_job_qualifications.sql)
  // — Required Skills used to just get folded into `description` as a
  // comma-separated blob; experience/education had no representation at all.
  minExperienceYears: z.coerce.number().int().min(0).max(60).optional(),
  maxExperienceYears: z.coerce.number().int().min(0).max(60).optional(),
  educationLevel: z.enum(["ANY", "HIGH_SCHOOL", "DIPLOMA", "BACHELORS", "MASTERS", "PHD"]).optional(),
  educationNotes: z.string().max(300).optional(),
  // A "skill" is a short tag ("React", "Node.js"), not a sentence — word
  // count (not just character length) is what actually catches a pasted
  // paragraph, since a single long compound word could still pass a
  // char-only check. Mirrors the frontend's own check (formValidation.js).
  requiredSkills: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((s) => s.split(/\s+/).filter(Boolean).length <= 5, {
          message: "Each skill must be 5 words or fewer.",
        })
    )
    .max(20)
    .optional(),
  // Real effect now (see migrations/019_urgent_matching.sql) — urgent posts
  // sort first and get early visibility to Silver-tier+ workers. No
  // subscription gating here; that track is deferred.
  isUrgent: z.boolean().optional(),
}).refine(
  (data) => data.maxExperienceYears === undefined || data.minExperienceYears === undefined || data.maxExperienceYears >= data.minExperienceYears,
  { message: "Max experience must be greater than or equal to min experience.", path: ["maxExperienceYears"] }
);

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
