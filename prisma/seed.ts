import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default user
  const user = await prisma.user.upsert({
    where: { id: 'catblanketflower' },
    update: {},
    create: {
      id: 'catblanketflower',
      name: "Singularity's Bounty",
    },
  });

  console.log(`Created user: ${user.id} (${user.name})`);
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
