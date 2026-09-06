/**
 * src/lib/templates/presets.ts
 *
 * AI Reply Fine-Tuning Presets & Prompt Tailoring (AI-02)
 *
 * Defines system default presets, length constraints, and prompt assembly helpers.
 */

export interface SystemPreset {
  id: string
  name: string
  description: string
  tone: string
  responseLength: 'CONCISE' | 'BALANCED' | 'DETAILED'
  customInstructions: string
  isSystem: true
}

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    id: 'sys_preset_professional_warm',
    name: 'Professional & Warm',
    description: 'Polished, authentic, and genuinely appreciative. Ideal for all business types.',
    tone: 'Warm, professional, sincere, and appreciative without being robotic or overly formal.',
    responseLength: 'BALANCED',
    customInstructions: 'Express genuine gratitude, address specific details from the customer review, and reinforce commitment to excellence.',
    isSystem: true,
  },
  {
    id: 'sys_preset_casual_friendly',
    name: 'Casual & Friendly',
    description: 'Upbeat, conversational, and energetic. Great for cafes, restaurants, fitness, and retail.',
    tone: 'Casual, friendly, upbeat, approachable, and enthusiastic. Use modern conversational English.',
    responseLength: 'BALANCED',
    customInstructions: 'Keep it lighthearted and authentic. Use a friendly greeting and express enthusiasm for seeing them again soon.',
    isSystem: true,
  },
  {
    id: 'sys_preset_formal_diplomatic',
    name: 'Formal & Diplomatic',
    description: 'Polite, respectful, and measured. Ideal for legal, medical, financial, and corporate services.',
    tone: 'Formal, dignified, respectful, structured, and diplomatic. Maintain strict professional boundaries.',
    responseLength: 'BALANCED',
    customInstructions: 'Maintain utmost discretion. For negative reviews or legal mentions, remain calm, neutral, and direct them to secure private channels.',
    isSystem: true,
  },
  {
    id: 'sys_preset_luxury_concierge',
    name: 'Luxury Concierge',
    description: 'Refined, high-touch, and gracious. Tailored for hotels, spas, fine dining, and boutique salons.',
    tone: 'Refined, hospitable, gracious, elegant, and attentive. Speak with the grace of a luxury concierge.',
    responseLength: 'DETAILED',
    customInstructions: 'Acknowledge the guest with utmost courtesy. Highlight dedication to curated, memorable experiences.',
    isSystem: true,
  },
  {
    id: 'sys_preset_empathetic_recovery',
    name: 'Empathetic Service Recovery',
    description: 'Sincere, ownership-taking, and reassurance-focused. Optimized for addressing complaints and negative reviews.',
    tone: 'Empathetic, humble, responsive, reassuring, and solution-oriented.',
    responseLength: 'BALANCED',
    customInstructions: 'Acknowledge frustration sincerely without being defensive. Offer a clear path forward and provide management contact info to make things right.',
    isSystem: true,
  },
  {
    id: 'sys_preset_concise_direct',
    name: 'Concise & Direct',
    description: 'Short, sweet, and to the point. Perfect for high-volume quick responses.',
    tone: 'Direct, clear, polite, and succinct.',
    responseLength: 'CONCISE',
    customInstructions: 'Limit response to 1-2 impactful sentences. No unnecessary filler.',
    isSystem: true,
  },
]

export interface PromptAssemblyOptions {
  businessName: string
  businessIndustry: string
  reviewAuthor: string
  reviewRating: number
  reviewText: string
  preset?: {
    name?: string
    tone?: string
    responseLength?: string
    customInstructions?: string | null
    signature?: string | null
  } | null
  brandVoice?: {
    toneGuidelines?: string
    signature?: string
    forbiddenPhrases?: string
    examples?: Array<{ reviewText: string; replyText: string }>
  } | null
  templateExample?: {
    title: string
    body: string
  } | null
}

/**
 * Builds the complete system prompt incorporating fine-tuning presets, brand voice, and templates.
 */
export function buildSystemPrompt(options: PromptAssemblyOptions): string {
  const { businessName, businessIndustry, reviewAuthor, preset, brandVoice, templateExample } = options
  const firstName = reviewAuthor.trim().split(/\s+/)[0] || 'there'

  const tone = preset?.tone || 'Warm, professional, and authentic — sound like a real person, not a bot'
  const responseLength = preset?.responseLength || 'BALANCED'

  let lengthRule = 'Be concise (2-4 sentences, max 60 words)'
  if (responseLength === 'CONCISE') {
    lengthRule = 'Be very brief and direct (1-2 sentences, max 35 words)'
  } else if (responseLength === 'DETAILED') {
    lengthRule = 'Provide a thorough and gracious reply (4-6 sentences, max 100 words)'
  }

  let prompt = `You are an expert customer service representative for ${businessName}, a ${businessIndustry} business.

Your task is to write a public reply to a customer's online review.

TONE & STYLE REQUIREMENTS:
- Voice & Tone: ${tone}
- Length: ${lengthRule}
- Address the customer by first name (${firstName})
- Reference specific details from their review to show you actually read it
- Match the sentiment:
  * 4-5 star reviews: Express genuine gratitude, invite them back
  * 3 star reviews: Thank them, acknowledge feedback, commit to improvement
  * 1-2 star reviews: Sincerely apologize, take responsibility, offer to make it right
- NEVER use cliché phrases like "We apologize for any inconvenience" or "We take feedback seriously"
- NEVER mention that this is an AI-generated response
- If the review mentions legal threats (lawsuit, attorney, BBB, lawyer), respond professionally asking them to contact management directly without admitting liability
- Do not include emojis or hashtags`

  if (preset?.customInstructions) {
    prompt += `\n\n--- PRESET INSTRUCTIONS (${preset.name || 'Custom Preset'}) ---\n${preset.customInstructions}\n--- END PRESET INSTRUCTIONS ---`
  }

  if (brandVoice) {
    prompt += '\n\n--- BRAND VOICE GUIDELINES ---'
    if (brandVoice.toneGuidelines) {
      prompt += `\nTONE GUIDELINES:\n${brandVoice.toneGuidelines}`
    }
    if (brandVoice.forbiddenPhrases) {
      prompt += `\nFORBIDDEN PHRASES (NEVER USE):\n${brandVoice.forbiddenPhrases}`
    }
    if (brandVoice.examples && brandVoice.examples.length > 0) {
      prompt += '\nSTYLE EXAMPLES:'
      brandVoice.examples.slice(0, 3).forEach((ex, idx) => {
        prompt += `\nExample ${idx + 1}:\nReview: "${ex.reviewText}"\nReply: "${ex.replyText}"`
      })
    }
    prompt += '\n--- END BRAND VOICE GUIDELINES ---'
  }

  if (templateExample) {
    prompt += `\n\n--- PREFERRED TEMPLATE PATTERN (${templateExample.title}) ---\nUse the following structure/style as a guiding template pattern:\n"${templateExample.body}"\n--- END TEMPLATE PATTERN ---`
  }

  const effectiveSignature = preset?.signature || brandVoice?.signature
  if (effectiveSignature) {
    prompt += `\n\nSIGNATURE: Append this signature to the end of the reply:\n${effectiveSignature}`
  } else {
    prompt += '\n\nDo not sign off with a name unless a signature is specified.'
  }

  prompt += '\n\nWrite ONLY the reply text, no preamble, no surrounding quotes.'
  return prompt
}
