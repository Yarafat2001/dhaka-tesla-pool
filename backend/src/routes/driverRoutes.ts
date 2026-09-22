import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import * as driverService from '../services/driverService';

export const driverRouter = Router();
driverRouter.use(requireAuth, requireRole('DRIVER'));

const onlineSchema = z.object({ isOnline: z.boolean() });

driverRouter.post('/online', async (req, res, next) => {
  try {
    const { isOnline } = onlineSchema.parse(req.body);
    const tesla = await driverService.setOnlineStatus(req.auth!.userId, isOnline);
    res.json(tesla);
  } catch (err) {
    next(err);
  }
});

driverRouter.get('/me', async (req, res, next) => {
  try {
    const tesla = await driverService.getMyTeslaWithActivePool(req.auth!.userId);
    res.json(tesla);
  } catch (err) {
    next(err);
  }
});

driverRouter.post('/pools/:poolId/arrive', async (req, res, next) => {
  try {
    const pool = await driverService.markDriverArrived(req.params.poolId, req.auth!.userId);
    res.json(pool);
  } catch (err) {
    next(err);
  }
});

driverRouter.post('/pools/:poolId/start', async (req, res, next) => {
  try {
    const pool = await driverService.startTrip(req.params.poolId, req.auth!.userId);
    res.json(pool);
  } catch (err) {
    next(err);
  }
});

driverRouter.post('/pools/:poolId/complete', async (req, res, next) => {
  try {
    const pool = await driverService.completeTrip(req.params.poolId, req.auth!.userId);
    res.json(pool);
  } catch (err) {
    next(err);
  }
});
