import bcrypt from "bcryptjs";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as authRepo from "../repositories/auth.repository.js";

const SALT_ROUNDS = 10;
const TOKEN_TTL = "7d";
const OTP_TTL_MINUTES = 5;
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

// POST /api/auth/register — public. role is restricted to worker|business
// by registerSchema; there is no path from this endpoint to an admin account.
export const register = asyncHandler(async (req, res) => {
  const { role, name, email, phone, password } = req.body;

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await usersRepo.create({ role, name, email, phone, passwordHash });
  } catch (err) {
    // 23505 = unique_violation — users.email is CITEXT UNIQUE.
    if (err.code === "23505") {
      throw ApiError.conflict("An account with this email already exists.");
    }
    throw err;
  }

  res.status(201).json({ data: { token: issueToken(user), user: toSelf(user) } });
});

function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(identifier, role, mode, otp) {
  const secret = process.env.OTP_SECRET || mustGetJwtSecret();
  return createHmac("sha256", secret)
    .update(`${identifier}:${role}:${mode}:${otp}`)
    .digest("hex");
}

function otpMatches(storedHash, candidateHash) {
  const stored = Buffer.from(storedHash, "utf8");
  const candidate = Buffer.from(candidateHash, "utf8");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function assertIdentifierBelongsToPayload({ identifier, email, phone }) {
  if (identifier !== email && identifier !== phone) {
    throw ApiError.badRequest("Identifier must match the submitted email or phone number.");
  }
}

async function findSigninUser({ identifier, email, phone, password }) {
  // Sign-in is role-agnostic. A real account's role comes from Postgres,
  // never from the Freelancer/Business entry point selected in the UI.
  const user = await authRepo.findAnyUserByIdentifier(identifier);
  const sameEmail = user?.email?.toLowerCase() === email;
  const samePhone = !phone || user?.phone === phone;
  const accountMatches = sameEmail && samePhone;
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !accountMatches || !passwordMatches) {
    throw ApiError.unauthorized("Invalid account details or password.");
  }

  return user;
}

async function assertSignupAvailable({ email, phone }) {
  const [emailUser, phoneUser] = await Promise.all([
    usersRepo.findByEmail(email),
    usersRepo.findByPhone(phone),
  ]);
  if (emailUser) throw ApiError.conflict("An account with this email already exists.");
  if (phoneUser) throw ApiError.conflict("An account with this phone number already exists.");
}

export const sendOtp = asyncHandler(async (req, res) => {
  const { identifier, role, mode } = req.body;
  assertIdentifierBelongsToPayload(req.body);

  let otpRole = role;
  if (mode === "signin") {
    const user = await findSigninUser(req.body);
    otpRole = user.role;
  } else {
    await assertSignupAvailable(req.body);
  }

  const previousOtp = await authRepo.findLatestOtp(identifier, otpRole);
  if (previousOtp) {
    const ageSeconds = (Date.now() - new Date(previousOtp.created_at).getTime()) / 1000;
    if (ageSeconds < OTP_RESEND_SECONDS) {
      throw new ApiError(
        429,
        `Please wait ${Math.ceil(OTP_RESEND_SECONDS - ageSeconds)} seconds before requesting another code.`
      );
    }
  }

  const otpCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  await authRepo.deleteOtpsForIdentifier(identifier, otpRole);
  await authRepo.createOtp({
    identifier,
    role: otpRole,
    code: hashOtp(identifier, otpRole, mode, otpCode),
    expiresAt,
  });

  // Development delivery adapter. Replace this line with your email/SMS
  // provider before production; the API response never exposes the code.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[auth:otp] ${identifier} (${otpRole}/${mode}) -> ${otpCode}`);
  }

  res.json({
    data: {
      message: `A verification code has been sent to ${identifier}.`,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendAfterSeconds: OTP_RESEND_SECONDS,
      role: otpRole,
    },
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { identifier, role, mode, otp, name, email, phone, password } = req.body;
  assertIdentifierBelongsToPayload(req.body);

  let user = null;
  let otpRole = role;
  if (mode === "signin") {
    user = await findSigninUser(req.body);
    otpRole = user.role;
  }

  const otpRow = await authRepo.findLatestOtp(identifier, otpRole);
  if (!otpRow || new Date(otpRow.expires_at).getTime() <= Date.now()) {
    await authRepo.deleteOtpsForIdentifier(identifier, otpRole);
    throw ApiError.unauthorized("This verification code is invalid or has expired.");
  }

  const candidateHash = hashOtp(identifier, otpRole, mode, otp);
  if (!otpMatches(otpRow.otp_code, candidateHash)) {
    throw ApiError.unauthorized("This verification code is invalid or has expired.");
  }

  if (mode === "signup") {
    await assertSignupAvailable(req.body);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    try {
      user = await usersRepo.create({ role, name, email, phone, passwordHash });
    } catch (err) {
      if (err.code === "23505") {
        throw ApiError.conflict("An account with these details already exists.");
      }
      throw err;
    }
  }

  // Consume the OTP only after every credential/database check succeeds.
  await authRepo.deleteOtpsForIdentifier(identifier, otpRole);
  res.status(mode === "signup" ? 201 : 200).json({
    data: { token: issueToken(user), user: toSelf(user) },
  });
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
