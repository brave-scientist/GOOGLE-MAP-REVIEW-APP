# Landing Page Prompt Pack — ReviewReply-Lite
Use these prompts in order, one at a time, in Lovable / v0 / Bolt / Claude Design or similar. Paste each prompt as-is, let the tool finish, review the result, then move to the next prompt. Don't paste all of them at once — that produces worse output than an incremental build.

A working reference build already exists (`landing-page.html`) if you want to show the tool a visual target or compare output.

---

## Prompt 0 — Design System Setup

```
Build a marketing landing page for "ReviewReply-Lite," a SaaS tool that watches a single local business's Google and Facebook reviews, drafts AI reply suggestions in the owner's own voice, and automatically sends review-request texts/emails to recent customers. The target user is a non-technical owner of one location — a restaurant, salon, dental office, or small retail shop. They are busy, not tech-savvy, and have never built a spreadsheet.

Design direction — follow this exactly, don't default to a generic SaaS template:
- Avoid the common AI-generated look of a cream background with a serif headline and a terracotta/orange accent. Avoid a plain black background with a single neon-green accent. Avoid a broadsheet/newspaper hairline-rule layout.
- Instead, use a "storefront signage" mood: deep pine-green as the dominant dark background (#13261D), a warm brass/gold accent (#C89B3C, lighter variant #E0BC6E), a warm off-white/cream for text on dark backgrounds (#F6F1E4), and a muted warm-khaki paper tone (#EFEADC, darker variant #E5DFC9) for alternating light sections. Use a coral-red (#E8604A) sparingly, only for star ratings and small alert accents — never as the dominant color.
- Typography: headlines in "Space Grotesk" (bold, geometric, signage-like character), body text in "Inter," and any stats/prices/labels in "IBM Plex Mono" for a ledger/receipt feel that fits a small-business tone.
- Recurring visual motif: a diagonal awning-stripe divider (alternating brass and dark-green diagonal stripes, like a shop awning) used as a thin section divider between major sections — this should feel literal and intentional, not decorative filler.
- Keep the overall feel warm, grounded, and slightly tactile — like a well-run neighborhood shop's brand, not a cold enterprise SaaS tool.

Set up the base page shell first: a sticky header with a logo mark (a small rotated brass square/diamond next to the wordmark "ReviewReply-Lite"), nav links (How it works, Features, Pricing, FAQ), and a "Start free trial" button in brass. Add the awning-stripe divider directly below the header. Don't build any page sections yet — just the header, the color/type system, and the awning-stripe component as a reusable element.
```

---

## Prompt 1 — Hero Section (the signature moment)

```
Now build the hero section, directly below the awning-stripe divider from the header.

Layout: two-column split on desktop (roughly 55/45), stacking to one column on mobile.

Left column:
- A small eyebrow label above the headline: "Built for single-location businesses" in brass, monospace font, uppercase, small letter-spacing, with a small coral dot before it.
- Headline (large, Space Grotesk, tight line-height): "Every review gets a reply. Before you even see it." — make the second sentence a lighter brass color as an accent, the first sentence in cream/white.
- Subheadline below in a dimmer cream tone: "ReviewReply-Lite watches your Google and Facebook reviews, drafts a reply that actually sounds like you, and asks happy customers to leave one — automatically. No spreadsheet required."
- Two buttons side by side: a solid brass primary button "Start your 14-day free trial," and an outlined secondary button "See how it works."
- A small note below the buttons in dim text: "No setup call needed · Cancel anytime · Card required to start trial"

Right column — this is the signature element of the whole page, build it carefully:
- A dark card (slightly lighter green than the page background) styled like a small app window, with three small dots at the top like browser/app chrome.
- Inside it, a "review card": a 2-star rating in coral stars, a small monospace tag reading "Google · 2h ago," a reviewer name "Marcus T.," and review text: "Food was good but we waited almost 25 minutes for a table even with a reservation."
- Below the review card, a dashed-border "reply drafting" box with a small pulsing dot and label "Drafting reply," and then an area where reply text animates in with a typewriter effect (typing character by character, then a blinking cursor), using this reply text: "Thanks so much for the honest feedback, Marcus — a 25-minute wait isn't the experience we want, even with a reservation. We're tightening up our seating flow this week. Hope you'll give us another shot soon!"
- After the typing finishes, show a small green checkmark line that fades in: "✓ Posted to Google — 0:04 after the review came in"
- Loop this whole animation every few seconds (clear the text, wait briefly, retype).

This hero must clearly demonstrate the core product in motion — a real review getting a fast, human-sounding reply — not just describe it in text.
```

---

## Prompt 2 — Problem Section

```
Build a "problem" section directly below the hero, on the light warm-paper background (not the dark background) for contrast.

- Small coral eyebrow label: "The problem"
- Headline in the dark ink text color: "You're not ignoring your reviews. You just don't have four hours a week for them."
- Supporting line: "Slow replies quietly cost local businesses new customers — and most owners find out only after it's already happened."
- Below that, three stat cards side by side (stacking on mobile) on a slightly darker paper-tone card background:
  1. Big monospace number "62%" with label "of shoppers read a business's review replies before deciding to visit" — and a small red-tinted "Placeholder stat — replace with sourced figure" tag beneath it.
  2. Big number "4+ days" with label "average time an independent business takes to reply to a review" — same placeholder tag beneath it.
  3. Big number "$0" with label "extra hours in your week to fix this manually" — no placeholder tag needed on this one, it's not a factual claim.

Make sure the placeholder tags are visually distinct (small red-outlined pill, monospace, uppercase) so they're impossible to miss and easy to find later when swapping in a real, sourced statistic.
```

---

## Prompt 3 — How It Works (4 Steps)

```
Build a "How it works" section on the dark background, below the problem section (add the awning-stripe divider between them).

- Eyebrow: "How it works"
- Headline: "Four steps. Ten minutes. Then it just runs."
- Four cards in a row (wrapping to 2x2 then 1 column on smaller screens), each with:
  - A small brass monospace number (01, 02, 03, 04)
  - A short bold title
  - A one-sentence description

Content for the four cards:
1. "Connect" — "Link your Google Business Profile (and Facebook Page, if you have one) in a couple of clicks."
2. "Reply" — "Every new review gets an AI-drafted reply in your voice, ready to post in one tap."
3. "Request" — "Add a customer's name and number — we text them a review link automatically."
4. "Grow" — "More replies, more requests, more reviews — without adding it to your to-do list."
```

---

## Prompt 4 — Feature Deep-Dives (3 alternating rows)

```
Build a features section on the light paper background, with three alternating rows (image-left/text-right, then flipped, then back), each row separated by generous vertical spacing. Each row has: a coral eyebrow label, a bold headline in dark ink text, a supporting paragraph, a short bulleted list with an arrow "→" marker in coral before each item, and a placeholder mockup image on the opposite side.

For the mockup images, use a placeholder image service (e.g. https://placehold.co/640x460/1c3327/f6f1e4?text=...) with descriptive text baked into the URL so it's obvious what real screenshot needs to replace it, and add a small "Mockup — replace with real product screenshot" tag beneath each image.

Row 1 — image right:
- Eyebrow: "Add customers your way"
- Headline: "No spreadsheet? No problem."
- Paragraph: "Most of our owners have never built a CSV — so we didn't make that the only way in."
- Bullets: "Quick-add a customer's name and number right from your dashboard" / "Paste a rough list from your Notes app — we sort it out for you" / "Already have a spreadsheet? Upload it too, if you'd rather"
- Mockup placeholder text: "Quick-add customer dashboard mockup"

Row 2 — image left (flip the layout):
- Eyebrow: "Replies that sound like you"
- Headline: "Not a robot. Not generic. You — just faster."
- Paragraph: "Tell us your tone once. Every draft matches it — warm for the good ones, calm and specific for the tough ones."
- Bullets: "One-tap posting, or edit the draft first — your call" / "Negative reviews always wait for your approval before posting" / "Auto-post available for 4–5 star reviews once you trust it"
- Mockup placeholder text: "AI reply drafting screen mockup"

Row 3 — image right:
- Eyebrow: "Know what's working"
- Headline: "See which requests turn into real reviews."
- Paragraph: "Every review request is tracked — sent, delivered, clicked — so you know it's actually working, not just running quietly in the background."
- Bullets: "Simple sent / clicked counts, no confusing analytics jargon" / "SMS and email, whichever your customers actually respond to" / "One dashboard for reviews and requests — nothing else to manage"
- Mockup placeholder text: "Requests sent / clicked mockup"
```

---

## Prompt 5 — Pricing Section

```
Build a pricing section on the dark background, centered header above two pricing cards side by side (stacking on mobile).

Header: eyebrow "Pricing," headline "One flat price. No per-review fees. No annual contract.", subline "Cancel anytime. Every plan includes a 14-day free trial."

Card 1 — Starter:
- Plan name label: "Starter"
- Price: "$29 / month" (large monospace number for "$29," smaller regular text for "/ month")
- Description: "For a single location just getting review replies under control."
- Checklist: "1 location" / "Google review replies (AI-drafted)" / "Quick-add + paste-list review requests" / "Email review requests" / "100 review requests included / month" / "Email support"
- Outlined button: "Start free trial"

Card 2 — Pro (visually featured — brass border, small "MOST POPULAR" tag above the card):
- Plan name label: "Pro"
- Price: "$59 / month"
- Description: "For businesses that want Facebook covered and text-message requests."
- Checklist: "1 location" / "Google + Facebook review replies" / "All review-request entry methods" / "SMS + email review requests" / "300 review requests included / month" / "Priority support"
- Solid brass button: "Start free trial"

Below both cards, centered small text: "Additional review requests beyond your plan's monthly amount: $0.05 each."

These exact prices ($29 and $59) and feature splits are final and locked — do not suggest alternative pricing or restructure the tiers.
```

---

## Prompt 6 — Testimonials Section

```
Build a testimonials section on the light paper background: centered header (eyebrow "From our beta businesses," headline "What early owners are saying"), then three testimonial cards side by side (stacking on mobile).

Each card: 5 coral stars at the top, a placeholder quote in italics-optional styling that reads: "Placeholder quote — swap with a real testimonial collected during beta. Keep it specific and short, not generic praise." Below the quote, a small circular avatar placeholder with a dashed brass border and the word "PHOTO" centered inside it, next to placeholder name "[Owner Name]" and placeholder business "[Business name, city]".

Make all three cards identical in structure — this section is meant to be filled in with real beta feedback later, so the placeholder nature should be obvious but the layout should look exactly like the finished version will.
```

---

## Prompt 7 — FAQ Section

```
Build an FAQ section on the dark background: eyebrow "FAQ," headline "Questions owners actually ask," then a vertical accordion list, narrower than full page width (max content width around 760px), where clicking a question expands its answer and collapses any other open answer. Use a "+" icon that rotates 45 degrees (into an "×") when a question is open.

Questions and answers:
1. "Do I need to know anything technical to set this up?" → "No. Connecting your Google Business Profile takes about two minutes and works the same way as logging into any app with your Google account. No code, no spreadsheets required."
2. "Will it ever post a reply I haven't approved?" → "Only if you turn on auto-post, and even then, only for 4 and 5-star reviews. Anything 1–3 stars always waits for your manual approval — no exceptions."
3. "I don't have a customer spreadsheet. Can I still send review requests?" → "Yes — that's exactly what the quick-add and paste-a-list options are for. Type in a name and number, or paste a rough list from your phone. No file required."
4. "Is there a contract?" → "No. Both plans are month-to-month, and you can cancel anytime from your billing settings — no phone call or support ticket needed."
5. "What happens to my customer list if I cancel?" → "Your customers' contact details are deleted within 30 days of cancellation. We don't hold onto it 'just in case.'"
```

---

## Prompt 8 — Final CTA + Footer

```
Build the final two sections to close out the page:

Final CTA: a rounded card with margin on both sides, dark elevated background (slightly lighter than the page), centered content: headline "Your next review is already on its way.", subline "Get the reply drafted before you even open the app.", and a single large brass "Start your 14-day free trial" button.

Footer: four columns (stacking to 2 columns on mobile):
1. Logo mark + wordmark, one-line description: "The review reply and request tool built for single-location businesses."
2. "Product" column: links to How it works, Features, Pricing, FAQ (anchor links to the sections already on this page).
3. "Company" column: links to Terms of Service, Privacy Policy, "vs. Birdeye," "vs. Podium" (placeholder hrefs are fine for now).
4. "Contact" column: "support@[yourdomain].com" with a small red-outlined "Placeholder — add real support inbox" tag beneath it, and "[Business address, if required for footer/legal]" with a "Placeholder — add if required" tag beneath it.

Below the four columns, a thin divider line, then a bottom row with "© 2026 ReviewReply-Lite. All rights reserved." on the left and "Made for businesses with one location and zero time to waste." on the right, stacking on mobile.
```

---

## Prompt 9 — Final Polish Pass (run last, after all sections exist)

```
Do a final review pass across the entire page:
1. Confirm every section alternates correctly between the dark pine-green background and the light warm-paper background, with the diagonal brass/green awning-stripe divider appearing between major section transitions — not on every single section boundary, just where it marks a real shift (after the header, after the hero, after the problem section, after pricing).
2. Confirm the page is fully responsive down to a 375px-wide mobile viewport: the hero should stack to one column with the demo card below the text, all three-and-four-column grids should collapse to one or two columns, and the footer should remain readable.
3. Confirm every interactive element (buttons, FAQ accordion, nav links) has a visible focus state for keyboard navigation, not just a hover state.
4. Double-check that all placeholder tags (mockup images, testimonial quotes, stats, contact details) are visually consistent and easy to spot — they should all use the same small red-outlined pill style so a non-technical person scanning the page can find every "thing I still need to replace" without reading the code.
5. Do not change the locked pricing ($29 Starter / $59 Pro), the locked feature lists per plan, or the color palette during this polish pass — polish means fixing spacing, alignment, and responsiveness, not re-designing.
```

---

## What to swap before this goes live (checklist)

- [ ] Replace all `placehold.co` mockup images with real product screenshots (once the app UI exists per `Implementation-Plan.md`).
- [ ] Replace the two placeholder stats ("62%," "4+ days") with real, sourced figures — or remove the stat cards entirely if no credible source is found; do not leave fabricated-sounding stats live.
- [ ] Replace all three testimonial cards with real beta-business quotes collected during Week 9–10 (per `Implementation-Plan.md`) — do not launch commercially with placeholder testimonials still showing.
- [ ] Replace `support@[yourdomain].com` and the placeholder address with real contact details once the domain and support inbox exist (per `Implementation-Plan.md` Week 7–8).
- [ ] Wire the "Start free trial" buttons to the real Stripe Checkout flow (Week 6 of the Implementation Plan) instead of placeholder `#` links.
- [ ] Link the footer's Terms of Service / Privacy Policy to the real pages once written (Week 7–8), not placeholder `#` links.
