// Seed script — populates the database with realistic ReviewReply Enterprise data
import { PrismaClient } from '@prisma/client'
import { ReviewSource, DraftStatus, Channel, RequestStatus, Plan, Role } from '@prisma/client'

const prisma = new PrismaClient()

const BUSINESS_NAMES = [
  'Bamboo Garden Restaurant',
  'Smile Studio Dental',
  'Urban Cuts Barbershop',
  'Pulse Fitness Studio',
  'The Daily Grind Cafe',
  'Sunset Realty Group',
]

const REVIEW_TEXTS_POSITIVE = [
  'Absolutely phenomenal experience. The staff went above and beyond to make us feel welcome. Will definitely be back!',
  'Best service in town. I have been coming here for years and the quality never drops. Highly recommend to anyone looking for top-notch service.',
  'Outstanding from start to finish. The team is professional, friendly, and genuinely cares about their customers. Five stars well deserved.',
  'I cannot say enough good things about this place. From the moment I walked in, I knew I was in good hands. The attention to detail is remarkable.',
  'Truly exceptional. The staff took the time to understand my needs and delivered beyond my expectations. This is what customer service should look like.',
  'Fantastic experience overall. Clean, modern, and welcoming atmosphere. The team is knowledgeable and friendly. I will be a repeat customer for sure.',
]

const REVIEW_TEXTS_NEGATIVE = [
  'Disappointing visit. The wait time was over 45 minutes with no apology or explanation. The staff seemed overwhelmed and disorganized.',
  'I had high hopes based on the reviews, but my experience was underwhelming. The service was slow and the staff seemed uninterested in helping.',
  'Poor communication throughout. I had to follow up multiple times to get a simple answer. Expected much better from a business of this caliber.',
  'The product quality did not match what was promised. When I raised the issue, the staff was dismissive. Will not be returning.',
  'Booked an appointment for 2pm, was not seen until 3:15pm. No apology, no offer to reschedule. Unprofessional and disrespectful of my time.',
]

const REVIEW_TEXTS_NEUTRAL = [
  'Decent experience overall. Nothing remarkable but no major complaints either. The service was adequate and the staff was polite.',
  'Average. The product met my basic expectations but did not exceed them. I might return if I am in the area, but would not go out of my way.',
  'It was fine. The staff was courteous and the service was timely. Nothing stood out as exceptional, but nothing was wrong either.',
  'Middle of the pack experience. The atmosphere was pleasant but the service was a bit slow. Reasonable prices though.',
]

const CUSTOMER_NAMES = [
  'Sarah Chen', 'Marcus Webb', 'Priya Patel', 'James Rodriguez', 'Emily Watson',
  'David Kim', 'Aisha Mohammed', 'Tom Sullivan', 'Lisa Anderson', 'Carlos Vega',
  'Maya Patel', 'Ben Foster', 'Nina Rossi', 'Alex Thompson', 'Jordan Lee',
]

const TOPICS_POSITIVE = ['food', 'service', 'cleanliness', 'atmosphere', 'value', 'staff']
const TOPICS_NEGATIVE = ['wait-time', 'pricing', 'communication', ' professionalism', 'cleanliness']

function randomDate(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo))
  return d
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomRating() {
  // Weighted: more positive than negative
  const r = Math.random()
  if (r < 0.55) return 5
  if (r < 0.75) return 4
  if (r < 0.85) return 3
  if (r < 0.95) return 2
  return 1
}

function getReviewTextAndTopics(rating: number) {
  let text: string
  let topics: string[]
  let sentiment: number
  if (rating >= 4) {
    text = pick(REVIEW_TEXTS_POSITIVE)
    // Ensure unique topics
    const t1 = pick(TOPICS_POSITIVE)
    let t2 = pick(TOPICS_POSITIVE)
    while (t2 === t1) t2 = pick(TOPICS_POSITIVE)
    topics = [t1, t2]
    sentiment = 0.6 + Math.random() * 0.4
  } else if (rating === 3) {
    text = pick(REVIEW_TEXTS_NEUTRAL)
    topics = ['service', 'value']
    sentiment = (Math.random() - 0.5) * 0.4
  } else {
    text = pick(REVIEW_TEXTS_NEGATIVE)
    const t1 = pick(TOPICS_NEGATIVE)
    let t2 = pick(TOPICS_NEGATIVE)
    while (t2 === t1) t2 = pick(TOPICS_NEGATIVE)
    topics = [t1, t2]
    sentiment = -0.4 - Math.random() * 0.5
  }
  return { text, topics: JSON.stringify(topics), sentiment: Math.round(sentiment * 100) / 100 }
}

async function main() {
  console.log('🌱 Seeding ReviewReply Enterprise database...')

  // Clear existing data
  await prisma.auditLog.deleteMany()
  await prisma.replyTemplate.deleteMany()
  await prisma.reviewRequest.deleteMany()
  await prisma.campaign.deleteMany()
  await prisma.review.deleteMany()
  await prisma.business.deleteMany()
  await prisma.orgMember.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.user.deleteMany()

  // Create user
  const user = await prisma.user.create({
    data: {
      email: 'owner@bamboogarden.com',
      name: 'Sarah Chen',
    },
  })

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Bamboo Garden Group',
      plan: Plan.PRO,
      trialEndsAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days
    },
  })

  // Add user as org owner
  await prisma.orgMember.create({
    data: {
      orgId: org.id,
      userId: user.id,
      role: Role.OWNER,
    },
  })

  // Create businesses
  const businesses = []
  for (let i = 0; i < 4; i++) {
    const biz = await prisma.business.create({
      data: {
        orgId: org.id,
        ownerId: user.id,
        name: BUSINESS_NAMES[i],
        industry: i === 1 ? 'dental' : i === 3 ? 'fitness' : i === 4 ? 'cafe' : 'restaurant',
        address: `${100 + i} Main Street, Suite ${i + 1}, San Francisco, CA 94102`,
        phone: `+1 (415) 555-${1000 + i}`,
        timezone: 'America/Los_Angeles',
        googleLocationId: `loc_${i}_google`,
        facebookPageId: `page_${i}_fb`,
        avgRating: 4.2 + Math.random() * 0.5,
        reviewCount: 50 + Math.floor(Math.random() * 200),
      },
    })
    businesses.push(biz)
  }

  // Create reviews for each business
  let reviewCount = 0
  for (const biz of businesses) {
    const numReviews = 15 + Math.floor(Math.random() * 25)
    for (let i = 0; i < numReviews; i++) {
      const rating = randomRating()
      const { text, topics, sentiment } = getReviewTextAndTopics(rating)
      const source = pick([ReviewSource.GOOGLE, ReviewSource.GOOGLE, ReviewSource.GOOGLE, ReviewSource.FACEBOOK, ReviewSource.YELP])
      const createdAt = randomDate(60)
      const hasReply = Math.random() < 0.4
      const draftStatus = hasReply ? DraftStatus.POSTED : (Math.random() < 0.3 ? DraftStatus.PENDING : DraftStatus.NONE)

      await prisma.review.create({
        data: {
          businessId: biz.id,
          source,
          externalId: `rev_${biz.id}_${i}`,
          author: pick(CUSTOMER_NAMES),
          authorAvatar: null,
          rating,
          title: rating >= 4 ? 'Great experience!' : rating <= 2 ? 'Disappointing' : 'Mixed experience',
          text,
          language: 'en',
          sentimentScore: sentiment,
          topics,
          replyText: hasReply ? 'Thank you so much for your feedback! We appreciate you taking the time to share your experience.' : null,
          repliedAt: hasReply ? randomDate(40) : null,
          repliedBy: hasReply ? user.id : null,
          draftText: draftStatus === DraftStatus.PENDING ? 'Thank you for sharing your experience. We would love to make this right — please reach out to us at hello@bamboogarden.com.' : null,
          draftStatus,
          createdAt,
          fetchedAt: createdAt,
        },
      })
      reviewCount++
    }
  }
  console.log(`  ✓ Created ${reviewCount} reviews across ${businesses.length} businesses`)

  // Create campaigns
  for (const biz of businesses.slice(0, 3)) {
    for (let c = 0; c < 2; c++) {
      const sentCount = 50 + Math.floor(Math.random() * 200)
      const clickCount = Math.floor(sentCount * (0.25 + Math.random() * 0.2))
      const conversionCount = Math.floor(clickCount * (0.2 + Math.random() * 0.2))
      const campaign = await prisma.campaign.create({
        data: {
          businessId: biz.id,
          name: c === 0 ? 'Post-visit follow-up' : 'Weekly review drive',
          description: 'Automated SMS + email to recent customers asking for a Google review',
          trigger: c === 0 ? 'event' : 'schedule',
          channelMix: 'sms,email',
          messageTemplate: 'Hi {{name}}, thanks for visiting {{business}}! Would you mind leaving us a quick review? {{link}}',
          status: c === 0 ? 'active' : 'completed',
          sentCount,
          clickCount,
          conversionCount,
        },
      })

      // Create review requests for the campaign
      for (let r = 0; r < 20; r++) {
        const status = Math.random() < 0.7 ? RequestStatus.SENT : Math.random() < 0.5 ? RequestStatus.CLICKED : RequestStatus.CONVERTED
        await prisma.reviewRequest.create({
          data: {
            businessId: biz.id,
            customerName: pick(CUSTOMER_NAMES),
            customerContact: `+1 (415) 555-${2000 + r}`,
            channel: pick([Channel.SMS, Channel.SMS, Channel.EMAIL]),
            status,
            message: 'Hi! Thanks for visiting. Would you mind leaving us a quick review?',
            sentAt: randomDate(30),
            deliveredAt: status !== RequestStatus.PENDING ? randomDate(29) : null,
            clickedAt: status === RequestStatus.CLICKED || status === RequestStatus.CONVERTED ? randomDate(28) : null,
            convertedAt: status === RequestStatus.CONVERTED ? randomDate(27) : null,
            campaignId: campaign.id,
          },
        })
      }
    }
  }

  // Create reply templates
  const templates = [
    { title: 'Positive — Generic', body: 'Thank you so much for your kind words! We are thrilled you had a great experience. We look forward to seeing you again soon.', category: 'positive' },
    { title: 'Positive — Food', body: 'Thank you for the wonderful review! Our team takes great pride in the food we serve. Cannot wait to welcome you back for another memorable meal.', category: 'positive' },
    { title: 'Negative — Service Recovery', body: 'We are so sorry to hear about your experience. This is not the standard we hold ourselves to. Please reach out to us directly at {{contact}} so we can make this right.', category: 'negative' },
    { title: 'Negative — Wait Time', body: 'Thank you for your patience and for sharing this feedback. We are actively working to reduce our wait times. We would love to offer you a complimentary visit — please contact us at {{contact}}.', category: 'negative' },
    { title: 'Neutral — Engagement', body: 'Thank you for taking the time to leave a review. We appreciate your feedback and are always looking for ways to improve. Hope to see you again soon!', category: 'neutral' },
    { title: 'Escalation — Do Not Auto-Post', body: 'We take this matter very seriously. A member of our management team will reach out to you within 24 hours to address your concerns directly.', category: 'escalation' },
  ]
  for (const tpl of templates) {
    await prisma.replyTemplate.create({
      data: {
        businessId: businesses[0].id,
        title: tpl.title,
        body: tpl.body,
        language: 'en',
        category: tpl.category,
        usageCount: Math.floor(Math.random() * 50),
      },
    })
  }

  // Create some audit logs
  const auditActions = [
    { action: 'business.created', targetType: 'business', metadata: '{"name":"Bamboo Garden Restaurant"}' },
    { action: 'review.received', targetType: 'review', metadata: '{"source":"google","rating":5}' },
    { action: 'review.received', targetType: 'review', metadata: '{"source":"facebook","rating":2}' },
    { action: 'draft.generated', targetType: 'review', metadata: '{"model":"claude-3-5-sonnet"}' },
    { action: 'reply.posted', targetType: 'review', metadata: '{"source":"google"}' },
    { action: 'campaign.sent', targetType: 'campaign', metadata: '{"channel":"sms","recipients":120}' },
    { action: 'user.login', targetType: 'user', metadata: '{"method":"password"}' },
    { action: 'billing.upgraded', targetType: 'organization', metadata: '{"from":"starter","to":"pro"}' },
  ]
  for (const log of auditActions) {
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: log.action,
        targetType: log.targetType,
        targetId: 'seed',
        metadata: log.metadata,
        ip: '192.168.1.1',
        createdAt: randomDate(7),
      },
    })
  }

  console.log(`  ✓ Created campaigns, review requests, reply templates, audit logs`)
  console.log('✅ Seed complete!')
  console.log(`   Login: owner@bamboogarden.com`)
  console.log(`   Org: ${org.name} (PRO plan)`)
  console.log(`   Businesses: ${businesses.length}`)
  console.log(`   Reviews: ${reviewCount}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
