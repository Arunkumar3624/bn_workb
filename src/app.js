import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

// Every route here is dynamic, per-user, and behind Bearer auth — none of it
// should ever be browser-cached. Express's default `res.json()` auto-
// generates an ETag on every response, and when an identical GET repeats
// with unchanged data (e.g. switching admin tabs back and forth re-fetches
// the same endpoint), the browser sends If-None-Match and gets back a 304
// with NO body. apiClient.js's apiFetch treats any non-2xx as a failure, so
// that legitimate-but-empty response was surfacing as "Request failed
// (304)" instead of just reusing the data — disabling ETags/caching
// entirely is the correct fix for an API shaped like this, not a workaround.
app.set("etag", false);
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Deployed frontend + local Vite dev server. FRONTEND_URL lets a future
// deploy add/change the allowed origin without a code change.
// Exported so the Socket.IO layer (realtime/socket.js) shares this exact
// allowlist instead of keeping a second copy in sync by hand.
export const allowedOrigins = [
  "http://localhost:5173",
  "https://wb-sdc9.onrender.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

// Vite bumps to the next free port (5174, 5175, ...) whenever 5173 is
// already taken — a second terminal, a leftover process — which would
// otherwise mean re-editing allowedOrigins every time that happens. Any
// localhost/127.0.0.1 port is trusted in non-production; the static list
// above is what actually matters once NODE_ENV=production.
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser callers (curl, server-to-server) send no Origin header
  if (allowedOrigins.includes(origin)) return true;
  return process.env.NODE_ENV !== "production" && LOCAL_ORIGIN_RE.test(origin);
}

app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) }));
// Default express.json() limit is 100kb — too small for the data-URL image
// uploads this app accepts (avatar photos, submission images, both base64
// text in the JSON body). 12mb comfortably covers an 8MB image's ~33% base64
// inflation plus JSON overhead; every other payload in this app is tiny.
app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", apiRouter);

// Order matters: notFoundHandler only runs if nothing above matched,
// errorHandler is last so it catches everything (including notFoundHandler's
// own ApiError, via asyncHandler/next(err) throughout the app).
app.use(notFoundHandler);
app.use(errorHandler);
