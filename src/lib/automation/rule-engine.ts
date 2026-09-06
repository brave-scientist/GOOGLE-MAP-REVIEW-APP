/**
 * src/lib/automation/rule-engine.ts
 *
 * AUTO-01: Automation Rule Evaluation & Escalation Engine.
 *
 * Implements:
 * 1. Multi-tenant rule resolution (scoped strictly to businessId)
 * 2. Composable condition evaluation (Rating, Sentiment, Severity, Source, Cooldown)
 * 3. Idempotent Escalation & Execution creation (DB-level unique constraints)
 * 4. Automated outbound dispatch coordination
 * 5. Structured observability and audit logging
 */

import { db } from '@/lib/db'
import {
  AutomationRule,
  AutomationActionType,
  EscalationSeverity,
  EscalationStatus,
  ExecutionStatus,
  ReviewSource,
  SentimentScoreCategory,
} from '@prisma/client'
import { classifyReviewSentiment, ClassificationResult } from './sentiment-classifier'
import { dispatchEscalationNotification } from './dispatch-service'

export interface RuleEvaluationResult {
  reviewId: string
  businessId: string
  rulesEvaluated: number
  matchedRules: number
  escalationsCreated: number
  dispatchesTriggered: number
  classification: ClassificationResult
  errors: string[]
}

const SEVERITY_RANKS: Record<EscalationSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
}

/**
 * Evaluates all active automation rules for a given review.
 */
export async function processReviewAutomations(params: {
  reviewId: string
  businessId: string
  actorId?: string | null
  eventSource?: string
}): Promise<RuleEvaluationResult> {
  const { reviewId, businessId, actorId, eventSource = 'review_ingestion' } = params

  const result: RuleEvaluationResult = {
    reviewId,
    businessId,
    rulesEvaluated: 0,
    matchedRules: 0,
    escalationsCreated: 0,
    dispatchesTriggered: 0,
    classification: {
      sentiment: 'NEUTRAL',
      sentimentScore: 0,
      severity: EscalationSeverity.LOW,
      topics: [],
      reasoning: '',
      confidence: 0,
      isEmergencyRisk: false,
      model: 'uninitialized',
    },
    errors: [],
  }

  // 1. Fetch review with business context
  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: { business: true },
  })

  if (!review) {
    result.errors.push(`Review ${reviewId} not found`)
    return result
  }

  // Security invariant: Verify review belongs to target business
  if (review.businessId !== businessId) {
    result.errors.push(`Tenant isolation mismatch: Review ${reviewId} does not belong to business ${businessId}`)
    return result
  }

  // 2. Classify sentiment and severity if not already stored on review
  let classification: ClassificationResult
  try {
    classification = await classifyReviewSentiment({
      text: review.text,
      rating: review.rating,
      author: review.author,
      businessName: review.business.name,
      industry: review.business.industry || undefined,
    })
    result.classification = classification

    // Persist sentiment score and topics onto review if newly classified
    if (review.sentimentScore === null || !review.topics) {
      await db.review.update({
        where: { id: review.id },
        data: {
          sentimentScore: classification.sentimentScore,
          topics: JSON.stringify(classification.topics),
        },
      })
    }
  } catch (classErr: any) {
    result.errors.push(`Classification failed: ${classErr.message}`)
    return result
  }

  // 3. Fetch all active automation rules for this business
  const rules = await db.automationRule.findMany({
    where: {
      businessId,
      isEnabled: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  result.rulesEvaluated = rules.length

  if (rules.length === 0) {
    return result
  }

  // 4. Evaluate each rule
  for (const rule of rules) {
    const idempotencyKey = `exec_${rule.id}_${review.id}`

    try {
      const isMatch = checkRuleMatch(rule, review.rating, review.source, classification)

      if (!isMatch) {
        // Record non-matching execution entry idempotently if needed
        await db.automationExecution.upsert({
          where: { idempotencyKey },
          create: {
            businessId,
            ruleId: rule.id,
            reviewId: review.id,
            idempotencyKey,
            status: ExecutionStatus.SKIPPED,
            matched: false,
            sentiment: classification.sentiment,
            severity: classification.severity,
          },
          update: {},
        })
        continue
      }

      result.matchedRules++

      // Parse action configuration safely
      let actionConfig: {
        notifyEmail?: string
        autoAssignUserId?: string
        customNote?: string
      } = {}

      if (rule.actionConfig) {
        try {
          actionConfig = JSON.parse(rule.actionConfig)
        } catch {}
      }

      // Check cooldown debounce
      if (rule.cooldownMinutes > 0 && rule.lastTriggeredAt) {
        const cooldownMs = rule.cooldownMinutes * 60 * 1000
        const timeSinceLast = Date.now() - rule.lastTriggeredAt.getTime()
        if (timeSinceLast < cooldownMs) {
          // Debounced
          await db.automationExecution.upsert({
            where: { idempotencyKey },
            create: {
              businessId,
              ruleId: rule.id,
              reviewId: review.id,
              idempotencyKey,
              status: ExecutionStatus.SKIPPED,
              matched: true,
              errorMessage: `Rule skipped due to cooldown (${rule.cooldownMinutes}m)`,
            },
            update: {},
          })
          continue
        }
      }

      // 5. Create Escalation and record Execution in transaction
      let escalation: any = null
      const shouldCreateEscalation =
        rule.actionType === AutomationActionType.CREATE_ESCALATION ||
        rule.actionType === AutomationActionType.ESCALATE_AND_NOTIFY

      if (shouldCreateEscalation) {
        const escalationReason = `${rule.name}: ${review.rating}-star ${review.source} review from ${review.author} classified as ${classification.sentiment} (${classification.severity} severity).`

        try {
          escalation = await db.escalation.upsert({
            where: {
              reviewId_ruleId: {
                reviewId: review.id,
                ruleId: rule.id,
              },
            },
            create: {
              businessId,
              reviewId: review.id,
              ruleId: rule.id,
              status: EscalationStatus.OPEN,
              severity: classification.severity,
              sentiment: classification.sentiment,
              sentimentScore: classification.sentimentScore,
              reason: escalationReason,
              assignedToUserId: actionConfig.autoAssignUserId || null,
              assignedToEmail: actionConfig.notifyEmail || null,
            },
            update: {},
          })

          result.escalationsCreated++

          // Audit log for escalation creation
          await db.auditLog.create({
            data: {
              actorId: actorId || null,
              action: 'escalation.created',
              targetType: 'escalation',
              targetId: escalation.id,
              metadata: JSON.stringify({
                escalationId: escalation.id,
                businessId,
                reviewId: review.id,
                ruleId: rule.id,
                severity: classification.severity,
                sentiment: classification.sentiment,
              }),
            },
          })
        } catch (escErr: any) {
          if (escErr?.code === 'P2002') {
            // Concurrent race won by another worker: retrieve the authoritative escalation record
            escalation = await db.escalation.findUnique({
              where: {
                reviewId_ruleId: {
                  reviewId: review.id,
                  ruleId: rule.id,
                },
              },
            })
          } else {
            console.error(`[Rule Engine] Error upserting escalation for rule ${rule.id}:`, escErr)
          }
        }
      }

      // Update rule's lastTriggeredAt timestamp
      await db.automationRule.update({
        where: { id: rule.id },
        data: { lastTriggeredAt: new Date() },
      })

      // Record successful automation execution
      await db.automationExecution.upsert({
        where: { idempotencyKey },
        create: {
          businessId,
          ruleId: rule.id,
          reviewId: review.id,
          idempotencyKey,
          status: ExecutionStatus.SUCCESS,
          matched: true,
          sentiment: classification.sentiment,
          severity: classification.severity,
        },
        update: {
          status: ExecutionStatus.SUCCESS,
          matched: true,
        },
      })

      // Structured audit for automation triggered
      await db.auditLog.create({
        data: {
          actorId: actorId || null,
          action: 'automation.triggered',
          targetType: 'automation_rule',
          targetId: rule.id,
          metadata: JSON.stringify({
            ruleId: rule.id,
            ruleName: rule.name,
            businessId,
            reviewId: review.id,
            rating: review.rating,
            source: review.source,
            sentiment: classification.sentiment,
            severity: classification.severity,
            eventSource,
          }),
        },
      })

      // 6. Handle Outbound Dispatch if configured
      const shouldDispatch =
        (rule.actionType === AutomationActionType.DISPATCH_NOTIFICATION ||
          rule.actionType === AutomationActionType.ESCALATE_AND_NOTIFY) &&
        actionConfig.notifyEmail

      if (shouldDispatch && escalation) {
        const dispatchRes = await dispatchEscalationNotification({
          escalationId: escalation.id,
          businessId,
          businessName: review.business.name,
          recipientEmail: actionConfig.notifyEmail!,
          reviewId: review.id,
          reviewAuthor: review.author,
          reviewRating: review.rating,
          reviewText: review.text,
          reviewSource: review.source,
          severity: classification.severity,
          reason: escalation.reason,
          customNote: actionConfig.customNote,
          ruleName: rule.name,
        })

        if (dispatchRes.success && !dispatchRes.idempotentSkip) {
          result.dispatchesTriggered++
        }
      }
    } catch (ruleErr: any) {
      console.error(`[Rule Engine] Error processing rule ${rule.id}:`, ruleErr)
      result.errors.push(`Rule ${rule.id} failed: ${ruleErr.message}`)

      // Record failed execution
      await db.automationExecution.upsert({
        where: { idempotencyKey },
        create: {
          businessId,
          ruleId: rule.id,
          reviewId: review.id,
          idempotencyKey,
          status: ExecutionStatus.FAILED,
          matched: true,
          errorMessage: ruleErr.message || String(ruleErr),
        },
        update: {
          status: ExecutionStatus.FAILED,
          errorMessage: ruleErr.message || String(ruleErr),
        },
      })
    }
  }

  return result
}

/**
 * Validates whether all configured conditions for an AutomationRule match the review.
 */
export function checkRuleMatch(
  rule: AutomationRule,
  rating: number,
  source: ReviewSource,
  classification: ClassificationResult
): boolean {
  // 1. Rating bounds check
  if (rule.minRating !== null && rating < rule.minRating) {
    return false
  }
  if (rule.maxRating !== null && rating > rule.maxRating) {
    return false
  }

  // 2. Sentiment threshold check
  if (rule.sentimentThreshold !== SentimentScoreCategory.ANY) {
    if (rule.sentimentThreshold === SentimentScoreCategory.NEGATIVE && classification.sentiment !== 'NEGATIVE') {
      return false
    }
    if (rule.sentimentThreshold === SentimentScoreCategory.POSITIVE && classification.sentiment !== 'POSITIVE') {
      return false
    }
    if (rule.sentimentThreshold === SentimentScoreCategory.NEUTRAL && classification.sentiment !== 'NEUTRAL') {
      return false
    }
  }

  // 3. Minimum Severity check
  const reviewRank = SEVERITY_RANKS[classification.severity] || 1
  const requiredRank = SEVERITY_RANKS[rule.minSeverity] || 2
  if (reviewRank < requiredRank) {
    return false
  }

  // 4. Source / Platform match
  if (rule.sources && rule.sources !== 'ALL') {
    const allowedSources = rule.sources.split(',').map((s) => s.trim().toUpperCase())
    if (!allowedSources.includes(source)) {
      return false
    }
  }

  return true
}
