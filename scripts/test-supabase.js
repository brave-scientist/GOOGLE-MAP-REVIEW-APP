const { PrismaClient } = require('@prisma/client');
const regions = [
  'ap-south-1', 'us-east-1', 'us-west-1', 'us-west-2', 'eu-central-1', 
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'sa-east-1', 'ca-central-1'
];
async function checkAuth() {
  for (const r of regions) {
    for (const port of [6543, 5432]) {
      const url = `postgresql://postgres.hmusvuarjbslyrhxxhfh:Saahil%401981%23%23@aws-0-${r}.pooler.supabase.com:${port}/postgres?sslmode=require`;
      const prisma = new PrismaClient({ datasources: { db: { url } } });
      try {
        const res = await prisma.$queryRawUnsafe('SELECT 1 as connected');
        console.log(`SUCCESS! Region: ${r} Port: ${port}`);
        console.log(`Working DATABASE_URL: ${url}`);
        await prisma.$disconnect();
        return { region: r, port, url };
      } catch (err) {
        // console.log(`${r}:${port} error: ${err.message}`);
        await prisma.$disconnect().catch(() => {});
      }
    }
  }
  console.log('Finished testing regions - none matched');
}
checkAuth();
