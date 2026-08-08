# Database migration: SQLite → Postgres/Supabase
#
# This script performs the migration. Run it after updating .env with your
# Postgres connection string.
#
# Prerequisites:
#   1. A Postgres instance (Supabase, local, or elsewhere)
#   2. DATABASE_URL in .env pointed at the Postgres instance
#      Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
#      Supabase example: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
#
# What this script does:
#   1. Changes prisma/schema.prisma provider from "sqlite" to "postgresql"
#   2. Runs prisma migrate dev --name init to create the schema in Postgres
#   3. Runs prisma db seed to populate demo data
#   4. Runs prisma generate to regenerate the client
#
# The old SQLite database file (db/custom.db) is left in place — you can
# delete it manually after confirming the migration worked.

set -e
cd /home/z/my-project

echo "=== Step 1: Verify DATABASE_URL is set to Postgres ==="
if ! grep -q "^DATABASE_URL=postgresql" .env; then
  echo "ERROR: DATABASE_URL in .env must start with 'postgresql://'"
  echo "Current value:"
  grep "^DATABASE_URL" .env || echo "(not set)"
  echo ""
  echo "Set it to your Postgres connection string, e.g.:"
  echo "  DATABASE_URL=postgresql://user:pass@host:5432/dbname?schema=public"
  exit 1
fi
echo "OK"

echo ""
echo "=== Step 2: Update schema.prisma provider ==="
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
echo "Changed provider to postgresql"
grep "provider" prisma/schema.prisma | head -2

echo ""
echo "=== Step 3: Push schema to Postgres (no migration history — matches current dev workflow) ==="
npx prisma db push

echo ""
echo "=== Step 4: Regenerate Prisma client ==="
npx prisma generate

echo ""
echo "=== Step 5: Seed demo data ==="
npx tsx scripts/seed.ts

echo ""
echo "=== Migration complete ==="
echo "Verify by running: npx prisma studio"
echo "Old SQLite file (db/custom.db) can be deleted once confirmed working."
