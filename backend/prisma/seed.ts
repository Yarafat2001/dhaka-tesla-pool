import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Approximate real-world Dhaka coordinates and distances, close enough for
// an MVP that explicitly does not do real routing (Section 4).
const ZONES: Record<string, { lat: number; lng: number }> = {
  Banani: { lat: 23.7937, lng: 90.4066 },
  'Gulshan 1': { lat: 23.7808, lng: 90.4142 },
  Mohakhali: { lat: 23.7789, lng: 90.4056 },
  Dhanmondi: { lat: 23.7461, lng: 90.3742 },
  Mirpur: { lat: 23.8223, lng: 90.3654 },
  Uttara: { lat: 23.8759, lng: 90.3795 },
  Farmgate: { lat: 23.7574, lng: 90.3898 },
  Bashundhara: { lat: 23.8151, lng: 90.4341 },
};

// Distance matrix (km), symmetric. Only a subset of pairs are populated -
// enough to run the demo story end to end; extend as needed.
const DISTANCES: Array<[string, string, number]> = [
  ['Banani', 'Mohakhali', 3.2], // Nusrat's trip
  ['Banani', 'Gulshan 1', 2.5], // Rafiq's trip
  ['Banani', 'Dhanmondi', 8.1],
  ['Banani', 'Uttara', 9.4],
  ['Banani', 'Farmgate', 6.0],
  ['Banani', 'Mirpur', 10.2],
  ['Banani', 'Bashundhara', 4.3],
  ['Gulshan 1', 'Mohakhali', 3.0],
  ['Dhanmondi', 'Farmgate', 2.8],
  ['Mirpur', 'Uttara', 7.5],
];

async function main() {
  console.log('Seeding zones...');
  const zoneRecords: Record<string, { id: string }> = {};
  for (const [name, coords] of Object.entries(ZONES)) {
    const zone = await prisma.zone.upsert({
      where: { name },
      update: {},
      create: { name, ...coords },
    });
    zoneRecords[name] = zone;
  }

  console.log('Seeding zone distances...');
  for (const [a, b, km] of DISTANCES) {
    await prisma.zoneDistance.upsert({
      where: { fromZoneId_toZoneId: { fromZoneId: zoneRecords[a].id, toZoneId: zoneRecords[b].id } },
      update: { distanceKm: km },
      create: { fromZoneId: zoneRecords[a].id, toZoneId: zoneRecords[b].id, distanceKm: km },
    });
    // symmetric reverse entry
    await prisma.zoneDistance.upsert({
      where: { fromZoneId_toZoneId: { fromZoneId: zoneRecords[b].id, toZoneId: zoneRecords[a].id } },
      update: { distanceKm: km },
      create: { fromZoneId: zoneRecords[b].id, toZoneId: zoneRecords[a].id, distanceKm: km },
    });
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  console.log('Seeding Jashim + Bullet...');
  const jashim = await prisma.user.upsert({
    where: { phone: '01710000001' },
    update: {},
    create: { name: 'Jashim', phone: '01710000001', passwordHash, role: 'DRIVER' },
  });
  await prisma.tesla.upsert({
    where: { driverId: jashim.id },
    update: {},
    create: { driverId: jashim.id, name: 'Bullet', plate: 'DHA-BULLET-01', capacity: 3, isOnline: true },
  });

  console.log('Seeding Nusrat, Rafiq, Shirin...');
  // Simulated TeslaPay wallets (Section 5): BDT 500.00 each, so the TeslaPay
  // payment path is actually demoable - a wallet at 0 makes the feature
  // untestable by hand. Re-seeding resets them, which is what a demo wants.
  const WALLET_POISHA = 50000;
  const nusrat = await prisma.user.upsert({
    where: { phone: '01710000002' },
    update: { walletBalancePoisha: WALLET_POISHA },
    create: {
      name: 'Nusrat',
      phone: '01710000002',
      passwordHash,
      role: 'PASSENGER',
      walletBalancePoisha: WALLET_POISHA,
    },
  });
  const rafiq = await prisma.user.upsert({
    where: { phone: '01710000003' },
    update: { walletBalancePoisha: WALLET_POISHA },
    create: {
      name: 'Rafiq',
      phone: '01710000003',
      passwordHash,
      role: 'PASSENGER',
      walletBalancePoisha: WALLET_POISHA,
    },
  });
  const shirin = await prisma.user.upsert({
    where: { phone: '01710000004' },
    update: { walletBalancePoisha: WALLET_POISHA },
    create: {
      name: 'Shirin',
      phone: '01710000004',
      passwordHash,
      role: 'PASSENGER',
      walletBalancePoisha: WALLET_POISHA,
    },
  });

  console.log('Seed complete. Demo credentials (all passwords: password123):');
  console.log(`  Driver  - Jashim  - phone ${jashim.phone}`);
  console.log(`  Passenger - Nusrat  - phone ${nusrat.phone}`);
  console.log(`  Passenger - Rafiq   - phone ${rafiq.phone}`);
  console.log(`  Passenger - Shirin  - phone ${shirin.phone}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
