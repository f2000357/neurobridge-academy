// DEV ONLY: give every existing operator a known password so all three roles
// can be exercised through the real /login flow. Never run against production.
//
//   node prisma/seed-passwords.mjs
//
// Prints each user's email and the shared dev password.

import { PrismaClient } from "@prisma/client";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

const DEV_PASSWORD = "neurable-dev";

async function hash(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } });
const passwordHash = await hash(DEV_PASSWORD);

for (const u of users) {
  // Give anyone without an email a dev one so they can sign in.
  const email = u.email ?? `${u.name.toLowerCase().replace(/[^a-z]+/g, ".")}@dev.neurable`;
  await prisma.user.update({ where: { id: u.id }, data: { email, passwordHash } });
  console.log(`${u.role.padEnd(14)} ${email}`);
}

console.log(`\nAll dev passwords: "${DEV_PASSWORD}"`);
await prisma.$disconnect();
