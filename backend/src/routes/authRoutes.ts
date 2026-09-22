import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService';

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  password: z.string().min(6),
  role: z.enum(['PASSENGER', 'DRIVER']),
  teslaName: z.string().optional(),
  teslaPlate: z.string().optional(),
  teslaCapacity: z.number().int().positive().optional(),
});

authRouter.post('/signup', async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const result = await authService.signup(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  phone: z.string().min(6),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const result = await authService.login(phone, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
