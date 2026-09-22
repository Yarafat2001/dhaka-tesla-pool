import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export interface SignupInput {
  name: string;
  phone: string;
  password: string;
  role: 'PASSENGER' | 'DRIVER';
  // Only used when role === 'DRIVER'
  teslaName?: string;
  teslaPlate?: string;
  teslaCapacity?: number;
}

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    throw new AppError('A user with this phone number already exists', 409);
  }
  if (input.role === 'DRIVER' && (!input.teslaName || !input.teslaPlate || !input.teslaCapacity)) {
    throw new AppError('Driver signup requires teslaName, teslaPlate, and teslaCapacity', 400);
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  // A driver's Tesla is created in the same transaction as their User row
  // so we never end up with a driver who has no vehicle (or vice versa).
  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        phone: input.phone,
        passwordHash,
        role: input.role,
      },
    });

    if (input.role === 'DRIVER') {
      await tx.tesla.create({
        data: {
          driverId: created.id,
          name: input.teslaName!,
          plate: input.teslaPlate!,
          capacity: input.teslaCapacity!,
        },
      });
    }

    return created;
  });

  const token = signToken({ userId: user.id, role: user.role });
  return { token, user: { id: user.id, name: user.name, role: user.role } };
}

export async function login(phone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new AppError('Invalid phone or password', 401);
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid phone or password', 401);
  }
  const token = signToken({ userId: user.id, role: user.role });
  return { token, user: { id: user.id, name: user.name, role: user.role } };
}
