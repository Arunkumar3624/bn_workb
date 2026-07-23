// Chat's "no sharing contact details" rule (see messages.controller.js) —
// hard-blocks a message outright rather than redacting it, so nothing about
// the sender's intent is silently lost; they see the rejection and rewrite.
// Deliberately simple regex detection (email + a long-enough run of digits),
// not an exhaustive anti-evasion system — good enough to stop the common
// case of someone pasting a phone number or email straight into chat.

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// A digit, optionally followed by a single separator (space/dash/dot/
// parenthesis), repeated 7+ times and capped by one more digit — catches
// "9342804230", "934-280-4230", and "+91 93428 04230" alike without having
// to enumerate every phone number format.
const PHONE_PATTERN = /(?:\d[\s.\-()]?){7,}\d/;

export function containsContactInfo(text) {
  if (!text) return false;
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text);
}
