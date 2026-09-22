import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/authRoutes';
import { rideRouter } from './routes/rideRoutes';
import { driverRouter } from './routes/driverRoutes';
import { zoneRouter } from './routes/zoneRoutes';
import { walletRouter } from './routes/walletRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/rides', rideRouter);
  app.use('/api/driver', driverRouter);
  app.use('/api/zones', zoneRouter);
  app.use('/api/wallet', walletRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
