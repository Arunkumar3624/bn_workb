// Chat's "no sharing contact details" rule (see messages.controller.js) —
// hard-blocks a message outright rather than redacting it, so nothing about
// the sender's intent is silently lost; they see the rejection and rewrite.
// Deliberately a fast, deterministic detector rather than an LLM call — an
// LLM per chat message would add real latency and cost to every send, and
// could judge two near-identical messages differently. This gets the same
// practical coverage (digits separated by symbols, digits separated by
// letter "noise", digits spelled out as words) with none of that downside.

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// "john at gmail dot com" — spelling out @ and . in words to dodge
// EMAIL_PATTERN above. Same "catch it even in wordings" requirement as the
// phone check below.
const SPELLED_EMAIL_PATTERN = /[a-zA-Z0-9._%-]+\s+at\s+[a-zA-Z0-9.-]+\s+dot\s+(com|in|org|net|co|io)\b/i;

const DIGIT_WORDS = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

// "nine three four two eight zero four five five two" needs to read as a
// digit run to hasEvasiveDigitRun the same way "9342804552" does — this
// swaps each spelled-out digit word for its numeral in place. Every other
// word is left untouched, so this can only ever ADD digits to the text,
// never remove real content or corrupt anything hasEvasiveDigitRun wasn't
// already looking at.
function spellOutDigitsToNumerals(text) {
  return text.replace(/[A-Za-z]+/g, (word) => DIGIT_WORDS[word.toLowerCase()] ?? word);
}

// A phone number pasted straight in ("9342804552") is the easy case. Real
// evasion breaks it up: a symbol between every digit ("9/3/6/1/7/4/3/9/4/5",
// the incident that first broadened this), or a run of letters used purely
// as noise ("934280kldw4552", the "sddc js" evasion this handles). This
// walks the message character by character and keeps a run of digits alive
// across a SHORT gap — a few non-space noise characters, or exactly one
// space (covers "93428 04230" / "+91 93428 04230") — but resets the run the
// moment a gap looks like a real word boundary: a comma or semicolon, two+
// spaces, or more than MAX_NOISE_GAP characters of noise. That's what stops
// an ordinary message that mentions several short numbers
// ("12, 45, 78, 90, 23, 56") from being misread as one 10-digit run.
// Not exhaustive — a phone number split across TWO messages, or noise words
// with embedded spaces, would still slip through — but it closes every
// evasion style reported so far without adding per-message latency or cost.
const MAX_NOISE_GAP = 5;
const MIN_DIGIT_RUN = 10;

function hasEvasiveDigitRun(text) {
  let runLength = 0;
  let gap = "";

  for (const ch of text) {
    if (ch >= "0" && ch <= "9") {
      const gapContinuesRun =
        gap === "" || gap === " " || (gap.length <= MAX_NOISE_GAP && !/[\s,;]/.test(gap));
      runLength = gapContinuesRun ? runLength + 1 : 1;
      gap = "";
      if (runLength >= MIN_DIGIT_RUN) return true;
    } else {
      gap += ch;
    }
  }
  return false;
}

export function containsContactInfo(text) {
  if (!text) return false;
  if (EMAIL_PATTERN.test(text) || SPELLED_EMAIL_PATTERN.test(text)) return true;
  return hasEvasiveDigitRun(spellOutDigitsToNumerals(text));
}
