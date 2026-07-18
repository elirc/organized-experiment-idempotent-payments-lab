import { PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashPassword("password123");

  const users = [
    { email: "customer@example.com", name: "Casey Customer", role: UserRole.CUSTOMER },
    { email: "support@example.com", name: "Sam Support", role: UserRole.SUPPORT },
    { email: "ops@example.com", name: "Owen Ops", role: UserRole.OPS },
    { email: "admin@example.com", name: "Ada Admin", role: UserRole.ADMIN },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
