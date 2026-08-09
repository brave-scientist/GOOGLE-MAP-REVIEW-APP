// scripts/seed-test-token.js — Test helper for AUD-01 verification
// Inserts a fake OAuthToken row so we can verify the integrations API
// flips google status from 'available' to 'connected'.
//
// Run with: node /home/z/my-project/scripts/seed-test-token.js <businessId> <action>
//   action: 'seed' or 'cleanup'

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const businessId = process.argv[2]
const action = process.argv[3] || 'seed'

async function main() {
  if (!businessId) {
    console.error('Usage: node seed-test-token.js <businessId> [seed|cleanup]')
    process.exit(1)
  }

  if (action === 'cleanup') {
    const result = await prisma.oAuthToken.deleteMany({
      where: { businessId, provider: 'google' },
    })
    console.log(`cleaned: deleted ${result.count} rows`)
  } else {
    const enc = (s) => Buffer.from(s).toString('base64')
    await prisma.oAuthToken.upsert({
      where: { businessId_provider: { businessId, provider: 'google' } },
      create: {
        businessId,
        provider: 'google',
        accessTokenEnc: enc('fake-access-token'),
        refreshTokenEnc: enc('fake-refresh-token'),
        expiresAt: new Date(Date.now() + 3600 * 1000),
        scopes: 'https://www.googleapis.com/auth/business.manage',
      },
      update: {
        accessTokenEnc: enc('fake-access-token'),
        refreshTokenEnc: enc('fake-refresh-token'),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    })
    console.log('seeded')
  }
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
