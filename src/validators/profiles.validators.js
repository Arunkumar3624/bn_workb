import { z } from "zod";
import { MILESTONE_LEVELS } from "../utils/gamification.js";

export const listProfilesQuerySchema = z.object({
  role: z.enum(["worker", "business"]),
});

// GET /api/profiles/:id — a malformed id (a stray "me", a bot probing
// random paths) used to reach findPublicProfileById unchecked and crash on
// Postgres's own uuid parser (error code 22P02), surfacing as a raw 500
// instead of a clean 400.
export const profileIdParamSchema = z.object({
  id: z.string().uuid("Not a valid profile ID."),
});

// null unpins; any other value must be a real MILESTONES level — the
// controller additionally checks it against the caller's own current_level
// (a schema can't see DB state), so this only rules out garbage input.
export const pinBadgeSchema = z.object({
  level: z
    .number()
    .int()
    .refine((v) => MILESTONE_LEVELS.includes(v), "Not a real badge level.")
    .nullable(),
});

// profilePatch is intentionally free-form (matches users.profile's JSONB,
// documented in schema.sql as "role-specific extras: skills[], hourly_rate,
// company_size, etc.") — shallow-merged server-side in updateSelf, not
// replaced, so this never needs to enumerate every possible field.
export const updateOwnProfileSchema = z.object({
  // null is a deliberate, distinct value from "omitted" here — it's how the
  // client asks to reset the avatar back to the default silhouette. See
  // updateSelf() in users.repository.js for how that's told apart from
  // "the client didn't touch this field at all".
  avatarUrl: z.string().url().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  phone: z.string().regex(/^\d{10}$/, "Enter exactly 10 numeric digits").optional(),
  name: z.string().trim().min(1).max(120).optional(),
  profilePatch: z.record(z.string(), z.unknown()).optional(),
  // The Onboarding Wizard's completion flag — only ever set to true, by the
  // wizard's own final step (see OnboardingWizard.jsx).
  hasCompletedOnboarding: z.boolean().optional(),
});
