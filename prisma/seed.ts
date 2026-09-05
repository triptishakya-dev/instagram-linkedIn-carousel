import "dotenv/config";
import { prisma } from "../lib/db";

/**
 * The single local user every API route resolves to until real sessions land.
 * Keep it in sync with `lib/auth.ts`.
 */
const DEV_USER_EMAIL = process.env.DEV_USER_EMAIL ?? "dev@localhost";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: { email: DEV_USER_EMAIL, name: "Local development" },
  });

  console.log(`Seeded user ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
