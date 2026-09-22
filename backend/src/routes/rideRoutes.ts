import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import * as rideService from '../services/rideService';

export const rideRouter = Router();
rideRouter.use(requireAuth, requireRole('PASSENGER'));

const requestSchema = z.object({
  pickupZoneId: z.string().min(1),
  dropoffZoneId: z.string().min(1),
  seats: z.number().int().positive().default(1),
  // Section 5: cash or the simulated TeslaPay wallet. Defaults to cash so
  // existing clients (and the passenger UI before you pick) keep working.
  paymentMethod: z.enum(['CASH', 'TESLAPAY']).default('CASH'),
});

rideRouter.post('/', async (req, res, next) => {
  try {
    const input = requestSchema.parse(req.body);
    const ride = await rideService.requestRide({ passengerId: req.auth!.userId, ...input });
    res.status(201).json(ride);
  } catch (err) {
    next(err);
  }
});

const estimateSchema = z.object({
  pickupZoneId: z.string().min(1),
  dropoffZoneId: z.string().min(1),
});

// Registered before the parameterised routes so `/estimate` is never treated as
// a ride id.
rideRouter.post('/estimate', async (req, res, next) => {
  try {
    const { pickupZoneId, dropoffZoneId } = estimateSchema.parse(req.body);
    res.json(await rideService.estimateFare(pickupZoneId, dropoffZoneId));
  } catch (err) {
    next(err);
  }
});

rideRouter.get('/mine', async (req, res, next) => {
  try {
    const rides = await rideService.listMyRides(req.auth!.userId);
    res.json(rides);
  } catch (err) {
    next(err);
  }
});

rideRouter.get('/:id', async (req, res, next) => {
  try {
    const ride = await rideService.getRideRequest(req.params.id, req.auth!.userId);
    res.json(ride);
  } catch (err) {
    next(err);
  }
});

rideRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const ride = await rideService.cancelRide(req.params.id, req.auth!.userId);
    res.json(ride);
  } catch (err) {
    next(err);
  }
});
