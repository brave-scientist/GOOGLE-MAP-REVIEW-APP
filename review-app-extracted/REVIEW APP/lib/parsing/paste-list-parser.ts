/**
 * lib/parsing/paste-list-parser.ts
 *
 * Lenient parser for the paste-a-list textarea (Phase 3, secondary entry method).
 * Accepts loose formats from non-technical users:
 *   "Jane Smith, 555-1234"
 *   "Jane Smith - 555-1234"
 *   "Jane Smith 5551234"
 *   "Jane Smith: (555) 123-4567"   jsmith@email.com
 * Returns a structured preview array plus an unparsed-line count, so the UI can
 * show "Found 8 contacts" and let the owner remove bad rows before confirming.
 *
 * Per Phase 3 acceptance: must parse >=90% of a loosely-formatted 5-10 line
 * list into a usable preview. Phone or email is detected per row; either is
 * accepted as the contact.
 */

export interface ParsedContact {
  name: string;
  contact: string; // phone or email
  channel: "sms" | "email";
  raw: string;
}

export interface ParseResult {
  contacts: ParsedContact[];
  unparsed: string[]; // lines we could not confidently parse
}

// Email regex — pragmatic, not RFC-exhaustive.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Phone regex — matches US-style with optional +1, dashes, dots, spaces, parens.
const PHONE_RE = /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;

/**
 * Parse a raw multi-line blob into structured contacts.
 */
export function parsePasteList(raw: string): ParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const contacts: ParsedContact[] = [];
  const unparsed: string[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      contacts.push(parsed);
    } else {
      unparsed.push(line);
    }
  }

  return { contacts, unparsed };
}

function parseLine(line: string): ParsedContact | null {
  // Try email first (often "Name <email>" or "Name email").
  const emailMatch = line.match(EMAIL_RE);
  if (emailMatch) {
    const email = emailMatch[0];
    const name = extractName(line.replace(email, ""));
    if (name) {
      return { name, contact: email, channel: "email", raw: line };
    }
  }

  // Try phone.
  const phoneMatch = line.match(PHONE_RE);
  if (phoneMatch) {
    const phone = normalizePhone(phoneMatch[0]);
    const name = extractName(line.replace(phoneMatch[0], ""));
    if (name) {
      return { name, contact: phone, channel: "sms", raw: line };
    }
  }

  return null;
}

/**
 * Extract a plausible name from the remainder of the line after removing the
 * contact token. Strips common separators (, - : | tab) and takes the longest
 * alphabetic-looking segment.
 */
function extractName(remainder: string): string | null {
  // Replace separators with spaces, collapse whitespace.
  const cleaned = remainder
    .replace(/[,:\-|<>()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  // Take tokens that look like name parts (letters, apostrophes, hyphens).
  const tokens = cleaned.split(" ").filter((t) => /^[A-Za-z][A-Za-z''\-]*$/.test(t));
  if (tokens.length === 0) return null;

  const name = tokens.slice(0, 3).join(" ");
  // Require at least one alphabetic token of length >= 2 to avoid junk.
  return name.length >= 2 ? name : null;
}

/** Normalize a phone number to digits-only (US-centric for this build). */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Drop leading country code 1 if present (11 digits).
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}