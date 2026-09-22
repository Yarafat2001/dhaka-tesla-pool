import { canAffordWithWallet, settlePayment } from '../domain/payment';

describe('payment settlement', () => {
  it('settles a cash fare on hand-over without touching the wallet', () => {
    const result = settlePayment({ method: 'CASH', amountPoisha: 6840, walletBalancePoisha: 0 });
    expect(result.status).toBe('PAID');
    expect(result.newWalletBalancePoisha).toBe(0); // cash never touches the wallet
  });

  it("debits Nusrat's wallet by exactly her pooled fare", () => {
    // ৳500.00 wallet, ৳68.40 fare -> ৳431.60 left
    const result = settlePayment({ method: 'TESLAPAY', amountPoisha: 6840, walletBalancePoisha: 50000 });
    expect(result.status).toBe('PAID');
    expect(result.newWalletBalancePoisha).toBe(43160);
  });

  it('exactly empties the wallet when the fare matches the balance', () => {
    const result = settlePayment({ method: 'TESLAPAY', amountPoisha: 6000, walletBalancePoisha: 6000 });
    expect(result.status).toBe('PAID');
    expect(result.newWalletBalancePoisha).toBe(0);
  });

  it('marks a TeslaPay fare FAILED when the balance is short, and keeps the balance', () => {
    const result = settlePayment({ method: 'TESLAPAY', amountPoisha: 12720, walletBalancePoisha: 5000 });
    expect(result.status).toBe('FAILED');
    expect(result.reason).toMatch(/Insufficient/);
    expect(result.newWalletBalancePoisha).toBe(5000); // no partial debit
  });

  it('never debits the wallet for a cash ride, even with a healthy balance', () => {
    const result = settlePayment({ method: 'CASH', amountPoisha: 6840, walletBalancePoisha: 50000 });
    expect(result.newWalletBalancePoisha).toBe(50000);
  });

  it('canAffordWithWallet is an inclusive comparison', () => {
    expect(canAffordWithWallet(6840, 6840)).toBe(true);
    expect(canAffordWithWallet(6839, 6840)).toBe(false);
  });

  it('rejects a negative fare rather than crediting the passenger', () => {
    expect(() => settlePayment({ method: 'TESLAPAY', amountPoisha: -1, walletBalancePoisha: 100 })).toThrow();
  });
});
