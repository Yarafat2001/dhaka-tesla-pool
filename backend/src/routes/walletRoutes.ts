import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import * as walletService from '../services/walletService';

export const walletRouter = Router();
walletRouter.use(requireAuth, requireRole('PASSENGER'));

walletRouter.get('/', async (req, res, next) => {
  try {
    res.json(await walletService.getWallet(req.auth!.userId));
  } catch (err) {
    next(err);
  }
});

const topUpSchema = z.object({ amountPoisha: z.number().int().positive() });

walletRouter.post('/topup', async (req, res, next) => {
  try {
    const { amountPoisha } = topUpSchema.parse(req.body);
    res.json(await walletService.topUpWallet(req.auth!.userId, amountPoisha));
  } catch (err) {
    next(err);
  }
});
