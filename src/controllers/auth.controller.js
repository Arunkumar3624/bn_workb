import bcrypt from "bcryptjs";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as authRepo from "../repositories/auth.repository.js";
import { sendOtpEmail, isEmailConfigured } from "../services/email.service.js";

const SALT_ROUNDS = 10;
const TOKEN_TTL = "7d";
const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;

// The caller's own profile — allowed to include email/phone (unlike
// public_user_profiles, which strips them for everyone else) but password_hash
// must never leave this module.
function toSelf(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, mustGetJwtSecret(), { expiresIn: TOKEN_TTL });
}

function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// mode is gone — OTP only ever means "registration email verification" now,
// so the HMAC namespace only needs identifier + role.
function hashOtp(identifier, role, otp) {
  const secret = process.env.OTP_SECRET || mustGetJwtSecret();
  return createHmac("sha256", secret)
    .update(`${identifier}:${role}:${otp}`)
    .digest("hex");
}

function otpMatches(storedHash, candidateHash) {
  const stored = Buffer.from(storedHash, "utf8");
  const candidate = Buffer.from(candidateHash, "utf8");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

async function assertSignupAvailable({ email, phone }) {
  const [emailUser, phoneUser] = await Promise.all([
    usersRepo.findByEmail(email),
    phone ? usersRepo.findByPhone(phone) : null,
  ]);
  if (emailUser) throw ApiError.conflict("An account with this email already exists.");
  if (phoneUser) throw ApiError.conflict("An account with this phone number already exists.");
}

// Send-or-console-log-or-throw — no DB side effects of its own. Callers
// decide what to clean up if this throws (register wipes the pending
// signup entirely; resendOtp leaves it in place so a signup in progress
// never loses its details just because one delivery attempt failed).
async function deliverOtp({ email, role, otpCode }) {
  if (isEmailConfigured()) {
    await sendOtpEmail({ to: email, otpCode, expiresInMinutes: OTP_TTL_MINUTES });
  } else if (process.env.NODE_ENV !== "production") {
    console.log(`[auth:otp] ${email} (${role}) -> ${otpCode}`);
  } else {
    throw ApiError.internal("OTP email delivery is not configured.");
  }
}

// POST /api/auth/register — public. role is restricted to worker|business by
// registerSchema; there is no path from this endpoint to an admin account.
//
// Does NOT touch the permanent `users` table yet — signup details + the OTP
// are held in pending_signups until verify-otp succeeds. If this is
// abandoned (tab closed, code never entered), nothing about this person is
// ever stored permanently, and the email/phone stay immediately available
// to register again.
export const register = asyncHandler(async (req, res) => {
  const { role, name, email, phone, password } = req.body;
  await assertSignupAvailable({ email, phone });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const otpCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  // A previous abandoned attempt for this exact email is simply replaced.
  await authRepo.deletePendingSignup(email);
  await authRepo.createPendingSignup({
    email,
    role,
    name,
    phone,
    passwordHash,
    otpCode: hashOtp(email, role, otpCode),
    expiresAt,
  });

  try {
    await deliverOtp({ email, role, otpCode });
  } catch (err) {
    await authRepo.deletePendingSignup(email); // a clean retry via register should always just work
    throw err;
  }

  res.status(201).json({
    data: {
      message: `A verification code has been sent to ${email}.`,
      email,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendAfterSeconds: OTP_RESEND_SECONDS,
    },
  });
});

// POST /api/auth/resend-otp — public. body: { email }
export const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const pending = await authRepo.findPendingSignup(email);
  if (!pending) {
    const existingUser = await usersRepo.findByEmail(email);
    if (existingUser) throw ApiError.badRequest("This account is already verified — please sign in.");
    throw ApiError.notFound("No pending registration found for this email.");
  }

  const ageSeconds = (Date.now() - new Date(pending.created_at).getTime()) / 1000;
  if (ageSeconds < OTP_RESEND_SECONDS) {
    throw new ApiError(
      429,
      `Please wait ${Math.ceil(OTP_RESEND_SECONDS - ageSeconds)} seconds before requesting another code.`
    );
  }

  const otpCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  await authRepo.refreshPendingSignupOtp(email, { otpCode: hashOtp(email, pending.role, otpCode), expiresAt });

  // Deliberately NOT deleting the pending signup on failure here — the
  // whole point of resend is to retry without losing name/phone/password.
  await deliverOtp({ email, role: pending.role, otpCode });

  res.json({
    data: {
      message: `A verification code has been sent to ${email}.`,
      email,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendAfterSeconds: OTP_RESEND_SECONDS,
    },
  });
});

// POST /api/auth/verify-otp — public. body: { email, otp }. This is the one
// place a fresh signup's `users` row actually gets created — the account
// exists in the permanent table from this moment on, already verified.
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const pending = await authRepo.findPendingSignup(email);
  if (!pending || new Date(pending.expires_at).getTime() <= Date.now()) {
    if (pending) await authRepo.deletePendingSignup(email);
    throw ApiError.unauthorized("This verification code is invalid or has expired.");
  }

  if (!otpMatches(pending.otp_code, hashOtp(email, pending.role, otp))) {
    throw ApiError.unauthorized("This verification code is invalid or has expired.");
  }

  // Defensive re-check — cheap, and covers the rare case where the email or
  // phone got claimed by someone else between register and this moment.
  await assertSignupAvailable({ email: pending.email, phone: pending.phone });

  let user;
  try {
    user = await usersRepo.create({
      role: pending.role,
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      passwordHash: pending.password_hash,
      emailVerified: true,
    });
  } catch (err) {
    if (err.code === "23505") throw ApiError.conflict("An account with this email already exists.");
    throw err;
  }

  await authRepo.deletePendingSignup(email);
  res.status(201).json({ data: { token: issueToken(user), user: toSelf(user) } });
});

// POST /api/auth/login — public. body: { email, password }. Password only —
// no OTP. Blocked with 403 (distinct from the 401 for bad credentials) until
// email_verified is true, so the registration OTP step isn't purely
// cosmetic — otherwise anyone could register with an email they don't
// control and use the platform without ever proving it.
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await usersRepo.findByEmail(email);
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password.");
  }
  if (!user.email_verified) {
    throw ApiError.forbidden("Please verify your email before signing in.");
  }

  res.json({ data: { token: issueToken(user), user: toSelf(user) } });
});

// GET /api/auth/me — behind `guard`. req.user.id comes from the verified
// JWT, never a client-supplied param.
export const me = asyncHandler(async (req, res) => {
  const user = await usersRepo.findById(req.user.id);
  if (!user) throw ApiError.notFound("User not found.");
  res.json({ data: toSelf(user) });
});

function mustGetJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw ApiError.internal("JWT_SECRET is not configured on the server.");
  return secret;
}
