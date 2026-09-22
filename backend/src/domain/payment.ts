/**
 * Payment rules (Section 5: "Cash or simulated TeslaPay wallet - no real
 * gateway needed").
 *
 * Kept as pure functions with local string-union types (mirroring
 * domain/stateMachine.ts) so the money rules are unit-testable without a
 * database or the generated Prisma client - the decision "did this ride settle,
 * and if so what is the wallet balance afterwards" is the part worth testing.
 *
 * All amounts are integer poisha, like every other money value in this codebase
 * (see docs/fare-model.md for why).
 */

export type PaymentMethod = 'CASH' | 'TESLAPAY';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface Settlement {
  status: PaymentStatus;
  /** The passenger's wallet balance after this settlement (unchanged for CASH). */
  newWalletBalancePoisha: number;
  /** Present only when the wallet could not cover the fare. */
  reason?: string;
}

export function canAffordWithWallet(walletBalancePoisha: number, amountPoisha: number): boolean {
  return walletBalancePoisha >= amountPoisha;
}

/**
 * Decides how one passenger's fare settles at trip completion.
 *
 * CASH: paid to the driver on hand-over, so it settles immediately and the
 * simulated wallet is not involved at all.
 *
 * TESLAPAY: debit the wallet atomically with the fare freeze. If the balance is
 * short the payment is recorded as FAILED rather than silently completing the
 * ride unpaid - the ride itself still COMPLETES, because refusing to end a
 * trip that already physically happened would strand the passenger and the
 * driver; chasing the shortfall is a separate concern (see README > Known
 * limitations).
 */
export function settlePayment(params: {
  method: PaymentMethod;
  amountPoisha: number;
  walletBalancePoisha: number;
}): Settlement {
  const { method, amountPoisha, walletBalancePoisha } = params;

  if (amountPoisha < 0) {
    throw new Error('amountPoisha must be >= 0');
  }

  if (method === 'CASH') {
    return { status: 'PAID', newWalletBalancePoisha: walletBalancePoisha };
  }

  if (!canAffordWithWallet(walletBalancePoisha, amountPoisha)) {
    return {
      status: 'FAILED',
      newWalletBalancePoisha: walletBalancePoisha,
      reason: 'Insufficient TeslaPay balance',
    };
  }

  return { status: 'PAID', newWalletBalancePoisha: walletBalancePoisha - amountPoisha };
}
