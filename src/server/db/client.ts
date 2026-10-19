import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

export type Db = PrismaClient;

/** Prisma client over the node-postgres driver adapter (Prisma 7). */
export function createPrismaClient(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
