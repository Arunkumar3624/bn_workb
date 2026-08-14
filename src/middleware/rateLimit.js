import rateLimit from "express-rate-limit";

// Shared JSON error shape (errorHandler.js's format) so a rate-limited
// request looks like any other ApiError to the frontend's apiFetch, not a
// bare express-rate-limit default body it doesn't know how to parse.
function rateLimitHandler(_req, res) {
  res.status(429).json({ error: { message: "Too many requests — please wait a moment and try again.", code: 429 } });
}

// Applied globally (app.js) — generous, just a backstop against a runaway
// script or a DDoS-shaped burst, not meant to bother a real user at all.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Applied only to the real credential-guessing surface (login, register,
// OTP verify/resend, password reset) — auth.routes.js. Tight enough to
// actually stop brute-forcing a password or a 6-digit OTP, loose enough
// that a real user fumbling their password a few times never hits it.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
