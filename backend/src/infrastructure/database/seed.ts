import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { logger } from '../../shared/logger';

async function seed() {
  logger.info('Seeding database...');

  // Services catalog (fixed-price)
  const services = await Promise.all([
    prisma.service.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        nameAr: 'تركيب مكيف',
        nameEn: 'AC Installation',
        category: 'HVAC',
        priceJod: 25,
        durationMin: 90,
      },
    }),
    prisma.service.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        nameAr: 'صيانة مكيف',
        nameEn: 'AC Maintenance',
        category: 'HVAC',
        priceJod: 15,
        durationMin: 60,
      },
    }),
    prisma.service.upsert({
      where: { id: '00000000-0000-0000-0000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000003',
        nameAr: 'كهربائي',
        nameEn: 'Electrician',
        category: 'ELECTRICAL',
        priceJod: 20,
        durationMin: 60,
      },
    }),
    prisma.service.upsert({
      where: { id: '00000000-0000-0000-0000-000000000004' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000004',
        nameAr: 'سباك',
        nameEn: 'Plumber',
        category: 'PLUMBING',
        priceJod: 18,
        durationMin: 60,
      },
    }),
    prisma.service.upsert({
      where: { id: '00000000-0000-0000-0000-000000000005' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000005',
        nameAr: 'نجار',
        nameEn: 'Carpenter',
        category: 'CARPENTRY',
        priceJod: 22,
        durationMin: 120,
      },
    }),
  ]);

  logger.info({ count: services.length }, 'Services seeded');

  // Sample customer
  const customer = await prisma.user.upsert({
    where: { phone: '+962799000001' },
    update: {},
    create: {
      phone: '+962799000001',
      name: 'أحمد الطالب',
      role: 'CUSTOMER',
    },
  });

  // Sample technician
  const techUser = await prisma.user.upsert({
    where: { phone: '+962799000002' },
    update: {},
    create: {
      phone: '+962799000002',
      name: 'محمد الفني',
      role: 'TECHNICIAN',
    },
  });

  await prisma.technicianProfile.upsert({
    where: { userId: techUser.id },
    update: {},
    create: {
      userId: techUser.id,
      isVerified: true,
      isAvailable: true,
      currentLat: 31.9522,
      currentLng: 35.9331,
      rating: 4.8,
      totalReviews: 42,
    },
  });

  logger.info({ customer: customer.phone, technician: techUser.phone }, 'Sample users seeded');

  // Admin user — credentials come from env so we never bake a known password
  // into the repo. Production REQUIRES an explicit, strong ADMIN_PASSWORD;
  // local dev may fall back to a clearly-labelled default.
  const isProd = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@fixly.jo';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (isProd && !adminPassword) {
    throw new Error('ADMIN_PASSWORD is required to seed the admin user in production');
  }
  if (adminPassword && adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }
  if (!adminPassword) {
    logger.warn('ADMIN_PASSWORD not set — seeding the DEV-ONLY default admin password. Do NOT use in production.');
  }

  // Dev/test fall back to a well-known local password; production must override.
  const passwordHash = await bcrypt.hash(adminPassword ?? 'admin12345', 12);
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: 'مدير Fixly',
    },
  });

  logger.info({ adminEmail }, 'Admin user seeded');
  logger.info('Seed complete');
}

seed()
  .catch((e) => {
    logger.error(e, 'Seed failed');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
