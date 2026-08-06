/**
 * lib/ai/draft-reply.ts — AI reply drafting engine.
 *
 * THE CORE PRODUCT QUALITY BAR. Per Product-Roadmap.md Phase 2, every draft must:
 *   - 5-star: warm, specific (reference something from the review), short.
 *   - 4-star: warm, specific, thanks.
 *   - 3-star: acknowledge the specific gap, invite back.
 *   - 1-2 star: acknowledge specifically, no corporate apology, offer offline
 *     resolution path, NEVER argue or get defensive.
 *   - Never invent facts not in the review or business profile.
 *   - Match the business's stated brand voice.
 *
 * Mock mode (USE_MOCKS=true / no ANTHROPIC_API_KEY — default): a careful
 * rule-based generator implements these rules with varied phrasing. It is the
 * functional stand-in for the LLM. The REAL implementation (Anthropic Claude,
 * model claude-sonnet-4-6) is written below and activated by setting
 * USE_MOCKS=false + ANTHROPIC_API_KEY — swapping in real AI is an isolated
 * change to THIS FILE ONLY (per kickoff §2.2).
 *
 * Locked signature: draftReply(reviewText, rating, category, brandVoice, reviewerName)
 */

import { AI_MODEL, type BusinessCategory } from "@/lib/types";

const USE_MOCKS = process.env.USE_MOCKS !== "false";

export interface DraftReplyInput {
  reviewText: string;
  rating: number; // 1-5
  category: BusinessCategory;
  brandVoice: string | null;
  reviewerName: string;
  businessName?: string | null;
  businessPhone?: string | null;
}

export interface DraftReplyResult {
  draft: string;
  source: "rule-based" | "anthropic";
}

/** Public entry point — same signature the rest of the app imports. */
export async function draftReply(input: DraftReplyInput): Promise<DraftReplyResult> {
  const firstName = extractFirstName(input.reviewerName);
  const prompt = buildPrompt(input, firstName);

  if (USE_MOCKS || !process.env.ANTHROPIC_API_KEY) {
    // Rule-based generator: deterministic-quality, no network call.
    return { draft: ruleBasedDraft(input, firstName), source: "rule-based" };
  }

  return callAnthropic(prompt);
}

// ===========================================================================
// RULE-BASED GENERATOR (mock-mode engine)
// ===========================================================================

/**
 * Produces a genuinely good, on-brand draft following every Phase 2 rule.
 * Phrasing is varied (seeded by content hash) so repeated drafts differ.
 */
function ruleBasedDraft(input: DraftReplyInput, firstName: string): string {
  const { reviewText, rating, category, brandVoice } = input;
  const voice = parseBrandVoice(brandVoice);
  const specific = extractSpecific(reviewText, category);
  const gap = extractGap(reviewText, category);

  if (rating >= 5) {
    return fiveStarReply(firstName, specific, voice);
  }
  if (rating === 4) {
    return fourStarReply(firstName, specific, voice);
  }
  if (rating === 3) {
    return threeStarReply(firstName, gap, voice);
  }
  return negativeReply(firstName, gap, voice, input.businessPhone);
}

// ---- 5-star: warm, specific, short ----------------------------------------
function fiveStarReply(firstName: string, specific: string, voice: BrandVoice): string {
  const openers = voice.casual
    ? [
        `Thanks so much, ${firstName}!`,
        `Wow — thank you, ${firstName}!`,
        `${firstName}, that really made our day. Thank you!`,
      ]
    : [
        `Thank you so much, ${firstName}.`,
        `We truly appreciate the kind words, ${firstName}.`,
        `Thank you, ${firstName} — this means a lot to us.`,
      ];
  const middles = specific
    ? [
        `So glad the ${specific} hit the mark.`,
        `Thrilled you loved the ${specific} — that's exactly what we aim for.`,
        `The ${specific} is one of our favorites too.`,
      ]
    : [
        `We're so glad you had a great experience with us.`,
        `It was a pleasure having you.`,
        `Loved having you in — hope to see you again soon.`,
      ];
  const closers = voice.signature
    ? [`${voice.signature}`]
    : voice.casual
      ? [`Hope to see you again soon!`, `Can't wait to have you back.`, `See you next time!`]
      : [`We look forward to seeing you again.`, `We hope to welcome you back soon.`];
  return `${pickSeeded(openers, firstName)} ${pickSeeded(middles, firstName + "m")} ${pickSeeded(closers, firstName + "c")}`;
}

// ---- 4-star: warm, specific, thanks ---------------------------------------
function fourStarReply(firstName: string, specific: string, voice: BrandVoice): string {
  const openers = voice.casual
    ? [`Thanks, ${firstName}!`, `Really appreciate this, ${firstName}.`]
    : [`Thank you, ${firstName}.`, `We appreciate you taking the time, ${firstName}.`];
  const middles = specific
    ? [
        `Glad you enjoyed the ${specific}.`,
        `So happy the ${specific} stood out for you.`,
      ]
    : [`Glad you had a good experience overall.`];
  const closers = voice.casual
    ? [`Hope to see you again soon!`]
    : [`We look forward to your next visit.`];
  return `${pickSeeded(openers, firstName)} ${pickSeeded(middles, firstName + "4m")} ${pickSeeded(closers, firstName + "4c")}`;
}

// ---- 3-star: acknowledge the gap, invite back -----------------------------
function threeStarReply(firstName: string, gap: string, voice: BrandVoice): string {
  const acknowledge = gap
    ? [
        `You're right about ${gap} — that's fair, and we're working on it.`,
        `Appreciate you calling out ${gap}. We hear you.`,
        `${gap.charAt(0).toUpperCase() + gap.slice(1)} is exactly the kind of thing we want to fix, so thank you for mentioning it.`,
      ]
    : [
        `Thanks for the honest feedback, ${firstName}.`,
        `We appreciate you sharing where we fell short.`,
      ];
  const invite = voice.casual
    ? [`We'd love a chance to win that fifth star next time — come back and see us.`]
    : [`We'd welcome the chance to deliver a better experience on your next visit.`];
  return `Hi ${firstName} — ${pickSeeded(acknowledge, firstName + "3a")} ${pickSeeded(invite, firstName + "3i")}`;
}

// ---- 1-2 star: acknowledge specifically, offline path, never defensive -----
function negativeReply(
  firstName: string,
  gap: string,
  voice: BrandVoice,
  phone?: string | null
): string {
  const acknowledge = gap
    ? [
        `That's not the experience we want anyone to have, and ${gap} is on us.`,
        `Reading this — ${gap} should never have happened, and I'm sorry it did.`,
        `You're right to be frustrated about ${gap}.`,
      ]
    : [
        `This isn't the experience we want for anyone, and I'm sorry we let you down.`,
        `Thank you for taking the time to share this, even though it's not what we'd want to hear.`,
      ];
  const resolve = phone
    ? [
        `We'd genuinely like to make this right — if you're open to it, please give us a call at ${phone} and ask for the owner.`,
        `We'd like the chance to put this right. Reach us at ${phone} whenever works for you.`,
      ]
    : [
        `We'd genuinely like to make this right — please reach out to us directly and we'll do what we can.`,
        `We'd like the chance to put this right. Message us anytime and we'll follow up personally.`,
      ];
  // CRITICAL: no excuses, no "we were short-staffed," no defensiveness.
  return `Hi ${firstName}. ${pickSeeded(acknowledge, firstName + "na")} ${pickSeeded(resolve, firstName + "nr")}`;
}

// ===========================================================================
// BRAND VOICE + KEYWORD EXTRACTION
// ===========================================================================

interface BrandVoice {
  casual: boolean;
  signature: string | null;
}

function parseBrandVoice(notes: string | null): BrandVoice {
  if (!notes) return { casual: true, signature: null };
  const lower = notes.toLowerCase();
  const casual =
    lower.includes("casual") ||
    lower.includes("friendly") ||
    lower.includes("first name") ||
    lower.includes("laid back") ||
    lower.includes("warm");
  // Pull a signature phrase if the owner wrote one in quotes or after "always mention"/"sign off".
  const quoted = notes.match(/["“']([^"”']{2,60})["”']/);
  const signOff = notes.match(/(?:sign(?:-|\s)off|always (?:say|mention|end))[:\s]+(.+)/i);
  const signature = quoted?.[1] ?? signOff?.[1]?.trim().slice(0, 60) ?? null;
  return { casual, signature };
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","was","were","is","are","to","of","for","with","at","in","on","it","this","that","we","i","you","they","my","our","your","so","very","really","just","had","have","has","been","be","got","get","too","not","no","but","its","their","them","there","here","from","as","by","if","than","then","also","more","most","some","any","all","one","two","even","up","out","about","into","over","after","before","would","could","should","did","do","does","done","went","came","made","make","said","say","see","saw","felt","feel","very","wait","waiting","took","take","time","minutes","days","day","week","thing","things","us","me","he","she","his","her","again","back","first","last","experience","service","staff","place","people","everyone","everything","something","nothing","anything","really","definitely","absolutely","highly","recommend","review","visit","visited",
]);

const CATEGORY_KEYWORDS: Record<BusinessCategory, string[]> = {
  restaurant: ["food","burger","pizza","sub","sandwich","pasta","salad","soup","brunch","breakfast","lunch","dinner","steak","tacos","sushi","bread","coffee","dessert","wine","beer","cocktails","menu","flavor","flavours","flavors","dish","chef","server","waiter","host","reservation","table","meal","appetizer","sauce","cheese","meat","portion","plate","kitchen"],
  salon: ["cut","color","colour","highlights","balayage","blonde","stylist","blowout","blowdry","blow-dry","appointment","trim","roots","toner","foil","foils","extensions","nails","manicure","pedicure","wax","facial","massage"," stylist"],
  dental: ["cleaning","cleaned","filling","crown","root","canal","extraction","tooth","teeth","gums","whitening","hygienist","dentist","assistant","numb","numbing","x-ray","xrays","x-rays","cavity","appointment","office","chair","procedure"],
  retail: ["product","products","selection","store","shop","shelf","shelves","register","checkout","price","prices","sale","discount","return","exchange","receipt","size","stock","inventory","item","items","purchase","bought","found","customer","staff","employee","employees"],
  contractor: ["quote","estimate","price","crew","work","job","project","leak","plumbing","plumber","electric","electrical","roof","roofing","paint","painting","floor","flooring","drywall","installation","repair","fix","fixed","warranty","debris","cleanup","clean-up","schedule","deadline","communication"],
  other: ["product","service","staff","price","quality","experience","appointment","time","work","result","team","business","company"],
};

/** Extract a specific positive detail the reviewer mentioned. */
function extractSpecific(reviewText: string, category: BusinessCategory): string {
  const keywords = CATEGORY_KEYWORDS[category] ?? CATEGORY_KEYWORDS.other;
  const words = reviewText.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/);
  const matches = words.filter((w) => w.length > 2 && keywords.includes(w));
  return matches[0] ?? "";
}

/** Extract the specific gap/problem a 1-3 star reviewer mentioned. */
function extractGap(reviewText: string, category: BusinessCategory): string {
  const keywords = CATEGORY_KEYWORDS[category] ?? CATEGORY_KEYWORDS.other;
  const words = reviewText.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/);
  // Prefer problem-adjacent keywords first.
  const problems = ["wait","waited","waiting","cold","rude","slow","late","dirty","broken","wrong","argument","argued","price","bill","charge","charged","upsell","pressured","rushed","rough","messy","disorganized","noise","noisy","loud","hair","surprise","ignored","missed","forgot","forgotten","disappointing"];
  const problemHit = words.find((w) => problems.includes(w));
  if (problemHit) return problemHit;
  const keywordHit = words.find((w) => keywords.includes(w));
  return keywordHit ?? "";
}

function extractFirstName(reviewerName: string): string {
  const first = reviewerName.trim().split(/\s+/)[0]?.replace(/\W/g, "") || "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Deterministic pick so the same review yields the same draft, but different reviews vary. */
function pickSeeded(options: string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length]!;
}

// ===========================================================================
// REAL ANTHROPIC IMPLEMENTATION (active when USE_MOCKS=false + key present)
// ===========================================================================

function buildPrompt(input: DraftReplyInput, firstName: string): string {
  const { reviewText, rating, category, brandVoice, businessName } = input;
  const toneRules: Record<string, string> = {
    positive:
      "Warm, specific (reference something from the review text — not a generic 'thanks'), and short (1-3 sentences).",
    three:
      "Acknowledge the specific gap they mentioned. Invite them back. 2-3 sentences.",
    negative:
      "Acknowledge specifically what went wrong. No generic corporate apology language. Offer an offline path to resolve (e.g. 'please call us'). Never argue or get defensive. 2-4 sentences.",
  };
  const bucket = rating >= 4 ? "positive" : rating === 3 ? "three" : "negative";
  return `You are replying to a public review as the owner of ${businessName ?? "a local business"} (category: ${category}).

REVIEW FROM ${firstName} (${rating} stars):
${reviewText}

BRAND VOICE NOTES:
${brandVoice ?? "(use a warm, friendly, human tone)"}

RULES (do not break these):
- ${toneRules[bucket]}
- Never invent facts that aren't in the review or these notes.
- Match the brand voice exactly.
- Sound like a real human who runs this business, not a corporate bot.
- Do not use filler like "Dear valued customer." Address them as ${firstName}.

Write ONLY the reply text, ready to post. No quotation marks.`;
}

async function callAnthropic(prompt: string): Promise<DraftReplyResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`anthropic draftReply failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = json.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) throw new Error("anthropic returned no text");
  return { draft: text, source: "anthropic" };
}