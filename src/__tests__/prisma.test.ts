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
});
