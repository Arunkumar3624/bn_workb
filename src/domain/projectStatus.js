// Server-side mirror of Frontend/src/app/utils/projectStatus.js — the FSM
// rules must be enforced here too, not just trusted from the client. Kept
// as a plain duplicate rather than a shared package since frontend/backend
// are separate deployables in this repo; if they ever move into a
// monorepo-with-shared-package setup, this is the file to dedupe first.
export const PROJECT_STATUS_FLOW = [
  "INVITED",
  "ACCEPTED",
  "PENDING_FUNDS",
  "FUNDS_SECURED",
  "WORK_IN_PROGRESS",
  "FILES_SUBMITTED",
  "PENDING_RELEASE",
  "COMPLETED",
];

// actionBy: which role's PATCH request is allowed to move a project OUT of
// this status and into the next one in PROJECT_STATUS_FLOW.
export const PROJECT_STATUS_META = {
  INVITED: { actionBy: "worker" }, // worker accepts the invite via PATCH
  ACCEPTED: { actionBy: "business" }, // business submits transfer proof — POST /fund-escrow only, never PATCH (see projects.controller.js)
  // Only WorkBridge staff can move this one, and only via the atomic
  // /admin/escrow-funding/:id/resolve endpoint (real ledger write, same
  // reasoning PENDING_RELEASE -> COMPLETED uses) — never PATCH.
  PENDING_FUNDS: { actionBy: "admin" },
  FUNDS_SECURED: { actionBy: "worker" }, // worker starts work
  WORK_IN_PROGRESS: { actionBy: "worker" }, // worker submits files
  // Business requests release via plain PATCH (no ledger side effect yet —
  // that's why this step doesn't need its own atomic endpoint).
  FILES_SUBMITTED: { actionBy: "business" },
  // Only WorkBridge staff can move this one, and only via the atomic
  // /complete endpoint (real ledger writes + wallet credit) — never PATCH,
  // same reasoning FILES_SUBMITTED -> COMPLETED used to have.
  PENDING_RELEASE: { actionBy: "admin" },
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

  if (toStatus === "PENDING_RELEASE") {
    // Also unreachable via a plain PATCH once it has ledger consequences
    // beyond a status flip — today it doesn't, but keeping it out of the
    // generic PATCH's reach mirrors FILES_SUBMITTED -> COMPLETED's original
    // reasoning (an explicit, named business action, not a generic status
    // string the client picks). See requestRelease in projects.controller.js.
    return false;
  }

  if (toStatus === "PENDING_FUNDS" || toStatus === "FUNDS_SECURED") {
    // PENDING_FUNDS only via POST /fund-escrow (writes an
    // escrow_funding_requests row alongside the flip), FUNDS_SECURED only
    // via the admin's /escrow-funding/:id/resolve (writes the real ledger
    // row) — neither is a plain status string a client should ever pick
    // through the generic PATCH. See projects.controller.js/admin.controller.js.
    return false;
  }

  // The one backward-moving transition in the FSM: business requests a
  // revision instead of approving, sending the worker back to work with a
  // (optional) note on what to fix, rather than a full dispute.
  if (fromStatus === "FILES_SUBMITTED" && toStatus === "WORK_IN_PROGRESS") {
    return actorRole === "business";
  }

  const expectedNext = nextStatus(fromStatus);
  if (toStatus !== expectedNext) return false;

  return PROJECT_STATUS_META[fromStatus]?.actionBy === actorRole;
}
