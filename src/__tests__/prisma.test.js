import { describe, it, expect, vi } from 'vitest';
import prisma from '../lib/prisma.js';
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

describe('Prisma Client', () => {
  it('should be an instance of PrismaClient', () => {
    expect(prisma).toBeDefined();
    // Since it's a mock, we just check if it was initialized
    expect(PrismaClient).toHaveBeenCalled();
  });
});
