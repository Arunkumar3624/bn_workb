import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, nextStatus, PROJECT_STATUS_FLOW } from "../src/domain/projectStatus.js";

// The real FSM: INVITED -> ACCEPTED -> PENDING_FUNDS -> FUNDS_SECURED ->
// WORK_IN_PROGRESS -> FILES_SUBMITTED -> PENDING_RELEASE -> COMPLETED. Note
// this is the actual enum used across the codebase (schema.sql's
// project_status) — not the generic PENDING/ACTIVE/SUBMITTED naming from
// the task brief, which doesn't match this system. PENDING_FUNDS and
// PENDING_RELEASE are both human-in-the-loop steps: a business's "Fund
// Escrow"/"Approve & Release" only *requests* the next state (fundEscrow/
// requestRelease in projects.controller.js); only WorkBridge staff (admin)
// can grant PENDING_FUNDS -> FUNDS_SECURED (resolveEscrowFunding) or
// PENDING_RELEASE -> COMPLETED (completeProject), each via its own atomic
// endpoint.
test("nextStatus walks the flow forward, one step at a time", () => {
  assert.equal(nextStatus("INVITED"), "ACCEPTED");
  assert.equal(nextStatus("ACCEPTED"), "PENDING_FUNDS");
  assert.equal(nextStatus("PENDING_FUNDS"), "FUNDS_SECURED");
  assert.equal(nextStatus("FUNDS_SECURED"), "WORK_IN_PROGRESS");
  assert.equal(nextStatus("WORK_IN_PROGRESS"), "FILES_SUBMITTED");
  assert.equal(nextStatus("FILES_SUBMITTED"), "PENDING_RELEASE");
  assert.equal(nextStatus("PENDING_RELEASE"), "COMPLETED");
});

test("nextStatus returns null for the terminal status and unknown statuses", () => {
  assert.equal(nextStatus("COMPLETED"), null);
  assert.equal(nextStatus("CANCELLED"), null);
  assert.equal(nextStatus("not-a-real-status"), null);
});

test("canTransition allows each forward step only by the correct actor role", () => {
  assert.equal(canTransition({ fromStatus: "INVITED", toStatus: "ACCEPTED", actorRole: "worker" }), true);
  assert.equal(canTransition({ fromStatus: "INVITED", toStatus: "ACCEPTED", actorRole: "business" }), false);

  assert.equal(canTransition({ fromStatus: "FUNDS_SECURED", toStatus: "WORK_IN_PROGRESS", actorRole: "worker" }), true);
  assert.equal(canTransition({ fromStatus: "FUNDS_SECURED", toStatus: "WORK_IN_PROGRESS", actorRole: "business" }), false);

  assert.equal(canTransition({ fromStatus: "WORK_IN_PROGRESS", toStatus: "FILES_SUBMITTED", actorRole: "worker" }), true);
});

test("canTransition rejects skipping a step in the flow", () => {
  assert.equal(canTransition({ fromStatus: "INVITED", toStatus: "FUNDS_SECURED", actorRole: "worker" }), false);
  assert.equal(canTransition({ fromStatus: "ACCEPTED", toStatus: "FILES_SUBMITTED", actorRole: "business" }), false);
});

test("canTransition never allows COMPLETED via a plain transition — only /complete's atomic endpoint reaches it", () => {
  assert.equal(canTransition({ fromStatus: "FILES_SUBMITTED", toStatus: "COMPLETED", actorRole: "business" }), false);
  assert.equal(canTransition({ fromStatus: "FILES_SUBMITTED", toStatus: "COMPLETED", actorRole: "admin" }), false);
  assert.equal(canTransition({ fromStatus: "PENDING_RELEASE", toStatus: "COMPLETED", actorRole: "admin" }), false);
});

test("canTransition never allows PENDING_RELEASE via a plain transition — only requestRelease's atomic endpoint reaches it", () => {
  assert.equal(canTransition({ fromStatus: "FILES_SUBMITTED", toStatus: "PENDING_RELEASE", actorRole: "business" }), false);
});

test("canTransition never allows PENDING_FUNDS/FUNDS_SECURED via a plain transition — only fundEscrow/resolveEscrowFunding's atomic endpoints reach them", () => {
  assert.equal(canTransition({ fromStatus: "ACCEPTED", toStatus: "PENDING_FUNDS", actorRole: "business" }), false);
  assert.equal(canTransition({ fromStatus: "PENDING_FUNDS", toStatus: "FUNDS_SECURED", actorRole: "admin" }), false);
});

test("canTransition allows the one backward step — business requesting a revision", () => {
  assert.equal(canTransition({ fromStatus: "FILES_SUBMITTED", toStatus: "WORK_IN_PROGRESS", actorRole: "business" }), true);
  assert.equal(canTransition({ fromStatus: "FILES_SUBMITTED", toStatus: "WORK_IN_PROGRESS", actorRole: "worker" }), false);
});

test("canTransition allows CANCELLED/DISPUTED from any non-terminal status, by either role", () => {
  for (const status of PROJECT_STATUS_FLOW.filter((s) => s !== "COMPLETED")) {
    assert.equal(canTransition({ fromStatus: status, toStatus: "CANCELLED", actorRole: "worker" }), true, `CANCELLED from ${status} (worker)`);
    assert.equal(canTransition({ fromStatus: status, toStatus: "DISPUTED", actorRole: "business" }), true, `DISPUTED from ${status} (business)`);
  }
});

test("canTransition blocks CANCELLED/DISPUTED once a project is already COMPLETED", () => {
  assert.equal(canTransition({ fromStatus: "COMPLETED", toStatus: "CANCELLED", actorRole: "worker" }), false);
  assert.equal(canTransition({ fromStatus: "COMPLETED", toStatus: "DISPUTED", actorRole: "business" }), false);
});
