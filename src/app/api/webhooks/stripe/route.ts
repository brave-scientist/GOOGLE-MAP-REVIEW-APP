import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { Plan } from '@prisma/client'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Helper: map plan string safely to Prisma Plan enum (self-serve tiers)
function mapToPlanEnum(planStr?: string | null): Plan {
  if (!planStr) return Plan.FREE
  const upper = planStr.toUpperCase()
  if (upper === 'STARTER') return Plan.STARTER
  if (upper === 'PRO') return Plan.PRO
  if (upper === 'ENTERPRISE') return Plan.ENTERPRISE
  return Plan.FREE
}

// POST /api/webhooks/stripe — Idempotent Stripe Webhook Handler
export async function POST(request: NextRequest) {
  const bodyText = await request.text()
  const signature = request.headers.get('stripe-signature')

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event

  // Signature verification
  if (webhookSecret && signature) {
    try {
      event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret)
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message)
      return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
    }
  } else {
    // If webhook secret is not set (e.g. mock test environment), parse event JSON directly
    try {
      event = JSON.parse(bodyText) as Stripe.Event
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
  }

  const eventId = event.id
  const eventType = event.type

  if (!eventId) {
    return NextResponse.json({ error: 'Missing event ID' }, { status: 400 })
  }

  // Database-enforced atomic deduplication
  try {
    // Attempt to claim the event atomically via unique constraint on eventId
    await db.stripeWebhookEvent.create({
      data: {
        eventId,
        eventType,
      },
    })
  } catch (createErr: any) {
    // Prisma unique constraint violation (P2002) means event was already received
    if (createErr.code === 'P2002' || String(createErr).includes('Unique constraint')) {
      return NextResponse.json({ received: true, duplicate: true, message: 'Event already processed' })
    }
    console.error('Failed to record webhook event ledger:', createErr)
    return NextResponse.json({ error: 'Internal database error' }, { status: 500 })
  }

  try {
    // Process business mutation inside transaction
    await db.$transaction(async (tx) => {
      switch (eventType) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session
          const orgId = session.metadata?.orgId
          const planStr = session.metadata?.plan
          const plan = mapToPlanEnum(planStr)
          const customerId = session.customer ? String(session.customer) : null
          const subscriptionId = session.subscription ? String(session.subscription) : null

          if (orgId) {
            await tx.organization.update({
              where: { id: orgId },
              data: {
                plan,
                trialEndsAt: null, // Converted to paid subscription
                ...(customerId ? { stripeCustomerId: customerId } : {}),
                ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
                stripeSubscriptionStatus: 'active',
              },
            })

            await tx.auditLog.create({
              data: {
                action: 'billing.checkout_completed',
                targetType: 'organization',
                targetId: orgId,
                metadata: JSON.stringify({
                  plan,
                  customerId,
                  subscriptionId,
                  eventId,
                }),
              },
            })
          }
          break
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription
          const customerId = String(subscription.customer)
          const subscriptionId = subscription.id
          const status = subscription.status
          const orgId = subscription.metadata?.orgId

          // Find org by orgId or stripeCustomerId
          const org = orgId
            ? await tx.organization.findUnique({ where: { id: orgId } })
            : await tx.organization.findFirst({ where: { stripeCustomerId: customerId } })

          if (org) {
            let targetPlan = org.plan
            if (status === 'active' || status === 'trialing') {
              const planMetadata = subscription.metadata?.plan
              if (planMetadata) {
                targetPlan = mapToPlanEnum(planMetadata)
              }
            } else if (status === 'unpaid' || status === 'canceled' || status === 'incomplete_expired') {
              targetPlan = Plan.FREE
            }

            await tx.organization.update({
              where: { id: org.id },
              data: {
                plan: targetPlan,
                stripeSubscriptionId: subscriptionId,
                stripeSubscriptionStatus: status,
              },
            })

            await tx.auditLog.create({
              data: {
                action: 'billing.subscription_updated',
                targetType: 'organization',
                targetId: org.id,
                metadata: JSON.stringify({
                  status,
                  plan: targetPlan,
                  subscriptionId,
                  eventId,
                }),
              },
            })
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription
          const customerId = String(subscription.customer)
          const orgId = subscription.metadata?.orgId

          const org = orgId
            ? await tx.organization.findUnique({ where: { id: orgId } })
            : await tx.organization.findFirst({ where: { stripeCustomerId: customerId } })

          if (org) {
            await tx.organization.update({
              where: { id: org.id },
              data: {
                plan: Plan.FREE,
                stripeSubscriptionStatus: 'canceled',
              },
            })

            await tx.auditLog.create({
              data: {
                action: 'billing.subscription_canceled',
                targetType: 'organization',
                targetId: org.id,
                metadata: JSON.stringify({
                  subscriptionId: subscription.id,
                  eventId,
                }),
              },
            })
          }
          break
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice
          const customerId = invoice.customer ? String(invoice.customer) : null
          if (customerId) {
            const org = await tx.organization.findFirst({ where: { stripeCustomerId: customerId } })
            if (org) {
              await tx.organization.update({
                where: { id: org.id },
                data: {
                  stripeSubscriptionStatus: 'past_due',
                },
              })

              await tx.auditLog.create({
                data: {
                  action: 'billing.payment_failed',
                  targetType: 'organization',
                  targetId: org.id,
                  metadata: JSON.stringify({
                    invoiceId: invoice.id,
                    amountDue: invoice.amount_due,
                    eventId,
                  }),
                },
              })
            }
          }
          break
        }

        default:
          // Unhandled event types acknowledged safely
          break
      }

      // Mark webhook processed timestamp
      await tx.stripeWebhookEvent.update({
        where: { eventId },
        data: { processedAt: new Date() },
      })
    })

    return NextResponse.json({ received: true })
  } catch (processErr) {
    console.error('Failed to process Stripe webhook business mutation:', processErr)
    return NextResponse.json({ error: 'Failed to process webhook event' }, { status: 500 })
  }
}
