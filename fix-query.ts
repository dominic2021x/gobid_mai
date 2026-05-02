import { PrismaClient } from './lib/generated/prisma';

const prisma = new PrismaClient({ log: ['query'] });

async function main() {
  const cars = await prisma.products.findMany({ select: { category: true, subcategory: true, title: true, brand: true }, take: 5, where: { title: { contains: "bmw", mode: "insensitive" } } });
  console.log(cars);
}
main();
