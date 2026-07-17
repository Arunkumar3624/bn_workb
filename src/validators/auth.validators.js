import { z } from "zod";

// Deliberately excludes "admin" — public registration can never create an
// admin account. Mirrors user_role in schema.sql minus that one value.
export const registerSchema = z.object({
  role: z.enum(["worker", "business"]),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().regex(/^\d{10}$/, "Enter exactly 10 numeric digits").optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const phoneSchema = z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit phone number.");
const identifierSchema = z.union([emailSchema, phoneSchema]);

// Password + OTP is intentionally a two-step flow. The same pending account
// data is validated on both calls; a new user is only written after the OTP
// succeeds, while an existing user's password is checked before an OTP is
// issued and checked again when the code is redeemed.
const otpAuthFields = {
  identifier: identifierSchema,
  role: z.enum(["worker", "business", "admin"]),
  mode: z.enum(["signin", "signup"]),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  name: z.string().trim().min(2).max(200).optional(),
};

function requireSignupName(data, ctx) {
  if (data.mode === "signup" && data.role === "admin") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["role"],
      message: "Admin accounts cannot be created publicly.",
    });
  }
  if (data.mode === "signup" && !data.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["name"],
      message: "Full name is required to create an account.",
    });
  }
  if (data.mode === "signup" && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: "Phone number is required to create an account.",
    });
  }
}

export const sendOtpSchema = z.object(otpAuthFields).superRefine(requireSignupName);

export const verifyOtpSchema = z.object({
  ...otpAuthFields,
  otp: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code."),
}).superRefine(requireSignupName);
