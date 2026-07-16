// Server-side mirror of Frontend/src/app/utils/projectStatus.js — the FSM
// rules must be enforced here too, not just trusted from the client. Kept
// as a plain duplicate rather than a shared package since frontend/backend
// are separate deployables in this repo; if they ever move into a
// monorepo-with-shared-package setup, this is the file to dedupe first.
export const PROJECT_STATUS_FLOW = [
  "INVITED",
  "ACCEPTED",
  "FUNDS_SECURED",
  "WORK_IN_PROGRESS",
  "FILES_SUBMITTED",
  "COMPLETED",
];

// actionBy: which role's PATCH request is allowed to move a project OUT of
// this status and into the next one in PROJECT_STATUS_FLOW.
export const PROJECT_STATUS_META = {
  INVITED: { actionBy: "worker" }, // worker accepts the invite via PATCH
  ACCEPTED: { actionBy: "business" }, // business secures funds — POST /secure-funds only, never PATCH (see projects.controller.js)
  FUNDS_SECURED: { actionBy: "worker" }, // worker starts work
  WORK_IN_PROGRESS: { actionBy: "worker" }, // worker submits files
  FILES_SUBMITTED: { actionBy: "business" }, // business releases payment — POST /complete only, never PATCH
};

export function nextStatus(current) {
  const idx = PROJECT_STATUS_FLOW.indexOf(current);
  if (idx === -1 || idx === PROJECT_STATUS_FLOW.length - 1) return null;
  return PROJECT_STATUS_FLOW[idx + 1];
}

/**
 * Is `actorRole` allowed to move a project from `fromStatus` to `toStatus`?
 * CANCELLED/DISPUTED are reachable from any non-terminal status by either
 * participant — everything else must follow PROJECT_STATUS_FLOW in order,
 * one step at a time, by the correct role.
 */
export function canTransition({ fromStatus, toStatus, actorRole }) {
  if (toStatus === "CANCELLED" || toStatus === "DISPUTED") {
    return fromStatus !== "COMPLETED";
  }

  if (toStatus === "COMPLETED") {
    // Only reachable via the atomic /complete endpoint, never a plain PATCH.
    return false;
  }

  const expectedNext = nextStatus(fromStatus);
  if (toStatus !== expectedNext) return false;

  return PROJECT_STATUS_META[fromStatus]?.actionBy === actorRole;
}
