import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const zoneRouter = Router();

zoneRouter.get('/', async (_req, res, next) => {
  try {
    const zones = await prisma.zone.findMany({ orderBy: { name: 'asc' } });
    res.json(zones);
  } catch (err) {
    next(err);
  }
});
