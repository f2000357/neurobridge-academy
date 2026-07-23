import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const sunrise = await prisma.center.findFirst({ where: { name: "Sunrise Center" } });
  if (!sunrise) throw new Error("Sunrise Center not found");

  // NeuroBridge company admin (spans all centers)
  const hq = await prisma.user.upsert({
    where: { email: "admin@neurobridge.co" },
    update: {},
    create: { name: "NeuroBridge HQ", email: "admin@neurobridge.co", role: "neurable_admin" },
  });

  // Sunrise center admin + a second guide (for the transfer demo)
  const sunriseAdmin = await prisma.user.upsert({
    where: { email: "admin@sunrise.co" },
    update: {},
    create: { name: "Sunrise Admin", email: "admin@sunrise.co", role: "center_admin", centerId: sunrise.id },
  });
  const riya = await prisma.user.upsert({
    where: { email: "riya@sunrise.co" },
    update: {},
    create: { name: "Riya Nair", email: "riya@sunrise.co", role: "guide", centerId: sunrise.id },
  });

  // A second center to demonstrate global (cross-center) sharing
  let riverside = await prisma.center.findFirst({ where: { name: "Riverside Center" } });
  if (!riverside) riverside = await prisma.center.create({ data: { name: "Riverside Center", region: "NJ" } });
  const riverAdmin = await prisma.user.upsert({
    where: { email: "admin@riverside.co" },
    update: {},
    create: { name: "Riverside Admin", email: "admin@riverside.co", role: "center_admin", centerId: riverside.id },
  });
  const sam = await prisma.user.upsert({
    where: { email: "sam@riverside.co" },
    update: {},
    create: { name: "Sam Cole", email: "sam@riverside.co", role: "guide", centerId: riverside.id },
  });

  const all = await prisma.user.findMany({ select: { name: true, role: true, centerId: true } });
  console.log(JSON.stringify(all, null, 2));
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
