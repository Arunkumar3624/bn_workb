// Chat's "no sharing contact details" rule (see messages.controller.js) —
// hard-blocks a message outright rather than redacting it, so nothing about
// the sender's intent is silently lost; they see the rejection and rewrite.
// Deliberately simple regex detection (email + a long-enough run of digits),
// not an exhaustive anti-evasion system — good enough to stop the common
// case of someone pasting a phone number or email straight into chat.

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// A digit, optionally followed by a single separator, repeated 7+ times and
// capped by one more digit — catches "9342804230", "934-280-4230", and
// "+91 93428 04230" alike without having to enumerate every phone number
// format. The separator class was originally just space/dash/dot/
// parenthesis — a real evasion attempt ("9/3/6/1/7/4/3/9/4/5") got through
// by using "/" between every digit, which wasn't in that list. Broadened to
// every common "spell it out with a symbol between each digit" separator
// (slash, underscore, pipe, comma, colon) rather than just patching the one
// symbol that was actually used — same evasion with any of these still
// gets caught. Not exhaustive (spelling digits as words, e.g. "nine three
// six", would still slip through) — that's a real limitation worth
// revisiting if evasion keeps escalating, but this closes the cheap,
// common case without adding per-message latency/cost the way an LLM call
// on every chat send would.
const PHONE_PATTERN = /(?:\d[\s.\-()/_|,:]?){7,}\d/;

export function containsContactInfo(text) {
  if (!text) return false;
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text);
}
