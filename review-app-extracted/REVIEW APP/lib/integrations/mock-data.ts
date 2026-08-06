/**
 * lib/integrations/mock-data.ts — realistic mock review generator.
 *
 * Shared by google-business-profile.ts and facebook-graph.ts when USE_MOCKS.
 * Produces varied, plausible reviews across the locked business categories
 * (restaurant, salon, dental, retail, contractor) spanning the 1-5 star range.
 * Reviewer names are deliberately fictional; no real PII.
 */

import type { BusinessCategory, ReviewSource } from "@/lib/types";

const FIRST_NAMES = [
  "Marcus", "Priya", "Diego", "Hannah", "Jamal", "Sofia", "Liam", "Mei",
  "Owen", "Aisha", "Caleb", "Nora", "Theo", "Grace", "Ravi", "Lena",
  "Andre", "Mira", "Cole", "Tessa", "Hugo", "Bianca", "Felix", "Yuki",
];
const LAST_INITIAL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

interface CategoryPhrases {
  positive: string[];
  three: string[];
  negative: string[];
}

const PHRASES: Record<BusinessCategory, CategoryPhrases> = {
  restaurant: {
    positive: [
      "Best meatball sub I've had in years — the bread was perfect.",
      "Cozy spot, fast service, and the pupusas were incredible.",
      "Our server remembered our usual order. Felt like family.",
      "Brunch was unreal. The hollandaise alone is worth the trip.",
    ],
    three: [
      "Food was good but we waited almost 25 minutes for a table even with a reservation.",
      "Solid burger, nothing mind-blowing. A bit pricey for the portion.",
      "Nice vibe, but the music was too loud to talk easily.",
    ],
    negative: [
      "Waited 45 minutes past our reservation and the host rolled her eyes when we asked.",
      "Cold food, nobody checked on us. Really disappointing.",
      "Found a hair in my salad and the manager argued with me about it.",
    ],
  },
  salon: {
    positive: [
      "Best cut I've had in years. Listened to exactly what I wanted.",
      "The balayage came out gorgeous — already booked my next appointment.",
      "Friendly staff, zero upselling, just a great experience.",
      "My color lasted way longer than anywhere else I've been.",
    ],
    three: [
      "Cut is fine, but I had to wait 20 minutes past my appointment time.",
      "Loved the style, just wish it hadn't cost extra for the blowout.",
      "Good color, a little rushed at the end.",
    ],
    negative: [
      "Showed a photo, got something totally different. Refused to fix it.",
      "Double-booked my appointment then rushed through the cut.",
      "Color turned out orange. They were dismissive when I called back.",
    ],
  },
  dental: {
    positive: [
      "First dentist visit that didn't feel like a dentist visit. So gentle.",
      "The whole team was calm and explained every step. No judgment.",
      "Got me in same-day for a cracked tooth. Lifesavers.",
      "Modern office, on time, and they filed the insurance for me.",
    ],
    three: [
      "Clean and professional, but the wait was longer than the cleaning.",
      "Good care, the front desk was a little disorganized with billing.",
      "Fine visit, wish they'd warned me about the cost upfront.",
    ],
    negative: [
      "Felt rushed and the assistant was rough. Left with more pain than I came in with.",
      "Got a surprise bill three weeks later that nobody mentioned.",
      "Tried to upsell me on treatment I didn't need. Felt pressured.",
    ],
  },
  retail: {
    positive: [
      "Exactly what I needed and the staff actually knew the product.",
      "Found the last one in my size — they even offered to hold it.",
      "Great prices and they loaded it into my car. Above and beyond.",
      "Clean store, easy returns, no hassle.",
    ],
    three: [
      "Decent selection, one register open so the line was long.",
      "Found what I wanted, shelves were a little messy though.",
      "Fine experience, parking was the hard part.",
    ],
    negative: [
      "Staff ignored me for 15 minutes then were rude when I asked for help.",
      "Advertised sale price wasn't honored. Manager was dismissive.",
      "Bought something broken and they wouldn't exchange it without a receipt.",
    ],
  },
  contractor: {
    positive: [
      "Finished a day early and cleaned up better than before they started.",
      "Transparent quote, no surprises. The crew was respectful the whole time.",
      "Fixed a leak two other plumbers missed. Honest and fast.",
      "Showed up when they said they would. Rare these days.",
    ],
    three: [
      "Job looks solid, took a week longer than promised.",
      "Good workmanship, communication could've been better mid-project.",
      "Decent price, had to call them back once to touch up a detail.",
    ],
    negative: [
      "Three weeks late, didn't return calls, and left debris in my yard.",
      "Quote doubled halfway through. Won't be using them again.",
      "Shoddy work — had to hire someone else to redo it.",
    ],
  },
  other: {
    positive: [
      "Exactly what I was hoping for. Highly recommend.",
      "Smooth from start to finish, genuinely impressed.",
      "Went above and beyond. Will definitely return.",
    ],
    three: [
      "Got the job done, a couple of rough edges.",
      "Generally fine, a few things could've gone smoother.",
      "Met expectations, nothing stood out either way.",
    ],
    negative: [
      "Really disappointing experience, would not recommend.",
      "Multiple things went wrong and nobody took ownership.",
      "I expected a lot more for the price.",
    ],
  },
};

export interface MockReview {
  external_review_id: string;
  reviewer_name: string;
  rating: number; // 1-5
  review_text: string;
  review_created_at: string;
}

/**
 * Generate N varied mock reviews for a category. Ratings are spread across
 * 1-5 with a realistic skew toward positive (most real review profiles are).
 */
export function generateMockReviews(
  count: number,
  category: BusinessCategory,
  source: ReviewSource
): MockReview[] {
  const phrases = PHRASES[category] ?? PHRASES.other;
  const reviews: MockReview[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    // Weighted rating distribution: 5★ 45%, 4★ 20%, 3★ 12%, 2★ 10%, 1★ 13%.
    const roll = Math.random();
    const rating =
      roll < 0.45 ? 5 : roll < 0.65 ? 4 : roll < 0.77 ? 3 : roll < 0.87 ? 2 : 1;

    const text =
      rating >= 4
        ? pick(phrases.positive)
        : rating === 3
          ? pick(phrases.three)
          : pick(phrases.negative);

    const name = `${pick(FIRST_NAMES)} ${pick(LAST_INITIAL)}.`;
    // Spread review_created_at across the last 45 days.
    const ageMs = Math.floor(Math.random() * 45 * 24 * 60 * 60 * 1000);
    reviews.push({
      external_review_id: `${source}-mock-${category}-${i}-${Math.random()
        .toString(36)
        .slice(2, 9)}`,
      reviewer_name: name,
      rating,
      review_text: text,
      review_created_at: new Date(now - ageMs).toISOString(),
    });
  }
  return reviews;
}

/** Pre-seeded mock Google Business Profile locations for the mock connect flow. */
export const MOCK_GOOGLE_LOCATIONS = [
  { account_id: "mock-gbp-acct-001", place_id: "mock-place-001", name: "The Copper Spoon (Mock)" },
  { account_id: "mock-gbp-acct-002", place_id: "mock-place-002", name: "Bright Smile Dental (Mock)" },
  { account_id: "mock-gbp-acct-003", place_id: "mock-place-003", name: "Northside Salon (Mock)" },
];

/** Pre-seeded mock Facebook Pages for the mock connect flow. */
export const MOCK_FACEBOOK_PAGES = [
  { page_id: "mock-fb-page-001", name: "The Copper Spoon (Mock FB)" },
  { page_id: "mock-fb-page-002", name: "Bright Smile Dental (Mock FB)" },
  { page_id: "mock-fb-page-003", name: "Northside Salon (Mock FB)" },
];