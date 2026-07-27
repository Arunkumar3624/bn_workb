import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Each test file runs in its own process under `node --test`, so mutating
// these here doesn't leak into other suites. DATABASE_URL is a dummy —
// guard.js's import chain (repositories/users.repository.js -> db/client.js)
// throws at MODULE LOAD if it's missing at all (a fail-loudly-at-boot
// check), even though verifyAccessToken/requireRole below never actually
// issue a query — so this has to be set before the static import runs,
// which means importing guard.js dynamically, after these are assigned.
process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";

const { verifyAccessToken, requireRole } = await import("../src/middleware/guard.js");
const { ApiError } = await import("../src/utils/ApiError.js");

function signToken(payload, options) {
  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

test("verifyAccessToken accepts a well-formed token and returns { id, role }", () => {
  const token = signToken({ sub: "user-123", role: "worker" });
  const result = verifyAccessToken(token);
  assert.deepEqual(result, { id: "user-123", role: "worker" });
});

test("verifyAccessToken rejects a token signed with the wrong secret", () => {
  const token = jwt.sign({ sub: "user-123", role: "worker" }, "a-completely-different-secret");
  assert.throws(() => verifyAccessToken(token), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test("verifyAccessToken rejects a malformed token string", () => {
  assert.throws(() => verifyAccessToken("not.a.real.jwt"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test("verifyAccessToken rejects a valid signature missing the required 'sub' claim", () => {
  const token = signToken({ role: "worker" });
  assert.throws(() => verifyAccessToken(token), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 401);
    assert.match(err.message, /required claims/);
    return true;
  });
});

test("verifyAccessToken rejects a valid signature missing the required 'role' claim", () => {
  const token = signToken({ sub: "user-123" });
  assert.throws(() => verifyAccessToken(token), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test("verifyAccessToken rejects an expired token", () => {
  const token = signToken({ sub: "user-123", role: "worker" }, { expiresIn: -10 });
  assert.throws(() => verifyAccessToken(token), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test("requireRole calls next() when req.user.role is in the allowed list", () => {
  const req = { user: { id: "u1", role: "business" } };
  let nextCalled = false;
  requireRole("business", "admin")(req, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("requireRole throws 403 when req.user.role is not allowed — e.g. a worker hitting a business-only route", () => {
  const req = { user: { id: "u1", role: "worker" } };
  assert.throws(
    () => requireRole("business")(req, {}, () => {}),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 403);
      return true;
    }
  );
});

test("requireRole throws 401 if called before guard ever ran (no req.user at all)", () => {
  assert.throws(
    () => requireRole("worker")({}, {}, () => {}),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 401);
      return true;
    }
  );
});
