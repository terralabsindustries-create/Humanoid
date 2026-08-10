import { PrismaClient } from "@prisma/client";
import { seedRolesAndPermissions, ROLES } from "../src/lib/roles-seed.js";

const prisma = new PrismaClient();

async function main() {
  await seedRolesAndPermissions(prisma);
  for (const key of Object.keys(ROLES)) {
    console.log(`Seeded role "${key}"`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
