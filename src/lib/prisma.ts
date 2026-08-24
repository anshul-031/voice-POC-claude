/**
 * The single Prisma client for the process.
 *
 * Connection tuning belongs in `DATABASE_URL` rather than here, because the
 * right values depend on where the app runs. On a serverless or scale-to-zero
 * Postgres, point this at the provider's pooled endpoint and cap the client's
 * own pool (`?connection_limit=5&pool_timeout=20`); Prisma otherwise sizes the
 * pool from the host's CPU count, which can open far more connections than a
 * small managed database allows. See `.env.example`.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Closes the pool so a redeploy hands connections back instead of abandoning
 * them for the database to time out on its own.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
