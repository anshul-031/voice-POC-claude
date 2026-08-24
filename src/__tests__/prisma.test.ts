import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn().mockImplementation(function() {
    return {
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };
  });
  return { PrismaClient: MockPrismaClient };
});

describe('Prisma Client Instance', () => {
  it('should initialize a singleton prisma instance', async () => {
    // Re-import to trigger instantiation
    // @ts-expect-error dynamic import
    const { default: prisma } = await import('../lib/prisma.ts?test=init');
    expect(prisma).toBeDefined();
    expect(PrismaClient).toHaveBeenCalled();
  });

  it('releases the connection pool on shutdown', async () => {
    // A redeploy that never disconnects leaves connections for the database to
    // reap on its own timeout, so a restarting service can sit above its limit.
    // @ts-expect-error dynamic import
    const mod = await import('../lib/prisma.ts?test=disconnect');
    await mod.disconnectPrisma();
    expect(mod.default.$disconnect).toHaveBeenCalled();
  });
});
