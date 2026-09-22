import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * Simulated TeslaPay wallet (Section 5): there is no real payment gateway, so
 * "topping up" is just an increment on User.walletBalancePoisha. It exists so
 * the TeslaPay payment path is actually exercisable end to end instead of being
 * a schema column nobody can credit.
 */

// BDT 5,000.00 - a guard rail so a typo (e.g. amountPoisha: 100000000) can't
// mint a nonsense balance in the demo.
const MAX_TOP_UP_POISHA = 500000;

export async function getWallet(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  return { walletBalancePoisha: user.walletBalancePoisha, currency: 'BDT poisha' };
}

export async function topUpWallet(userId: string, amountPoisha: number) {
  if (!Number.isInteger(amountPoisha) || amountPoisha <= 0) {
    throw new AppError('amountPoisha must be a positive integer (poisha)', 400);
  }
  if (amountPoisha > MAX_TOP_UP_POISHA) {
    throw new AppError(`A single top-up cannot exceed ${MAX_TOP_UP_POISHA} poisha`, 400);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { walletBalancePoisha: { increment: amountPoisha } },
  });
  return { walletBalancePoisha: user.walletBalancePoisha };
}
