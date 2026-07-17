import prisma from '../lib/prisma.js';
import { WALLET } from '../types/enums.js';
import type { WalletAccount } from '../types/interfaces.js';

/** Load the persisted wallet settings used to authorize and price calls. */
export async function getWalletAccount(userId: string): Promise<WalletAccount> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletBalance: true, costPerMinute: true },
  });
  const balance = Number(user.walletBalance);
  return {
    balance,
    costPerMinute: Number(user.costPerMinute),
    canStartCall: balance >= WALLET.MINIMUM_CALL_BALANCE_INR,
  };
}

/** Whether the account currently meets the minimum balance for a new call. */
export async function canStartWalletCall(userId: string): Promise<boolean> {
  const wallet = await getWalletAccount(userId);
  return wallet.canStartCall;
}
