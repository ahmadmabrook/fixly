import 'dotenv/config';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { logger } from '../../shared/logger';

async function seed() {
  logger.info('Seeding database...');

  // Customer-facing SOP scope per category (Figma "Data reference", CustomerWeb.tsx
  // SOP record): what the fixed price includes vs. explicitly excludes.
  const SOP_BY_CATEGORY: Record<string, { sopIncludes: string[]; sopExcludes: string[] }> = {
    ELECTRICAL: {
      sopIncludes: ['فحص شامل من فني معتمد', 'إصلاح الأعطال الكهربائية', 'استبدال المفاتيح والقواطع', 'اختبار التشغيل والسلامة'],
      sopExcludes: ['أعمال التمديد الكامل للمبنى', 'قطع الغيار النادرة (تُسعّر منفصلة)', 'الأعمال خارج الشقة'],
    },
    PLUMBING: {
      sopIncludes: ['كشف التسريبات', 'إصلاح الحنفيات والصمامات', 'فك وتركيب السيفون', 'اختبار الضغط'],
      sopExcludes: ['تكسير البلاط والجدران', 'استبدال الخزانات الكاملة', 'شبكات الصرف الرئيسية'],
    },
    HVAC: {
      sopIncludes: ['تنظيف الفلاتر والوحدة الداخلية', 'فحص غاز التبريد', 'تنظيف مصرف المياه', 'اختبار كفاءة التبريد'],
      sopExcludes: ['شحن الغاز (يُسعّر منفصلاً)', 'تركيب وحدات جديدة', 'تمديدات النحاس'],
    },
    PAINTING: {
      sopIncludes: ['تجهيز السطح', 'طبقتان من الدهان', 'حماية الأرضيات والأثاث'],
      sopExcludes: ['أعمال الجبس والديكور', 'الترميم الإنشائي'],
    },
    CARPENTRY: {
      sopIncludes: ['تجميع القطعة', 'التثبيت على الجدار', 'التخلص من مواد التغليف'],
      sopExcludes: ['أعمال النجارة المخصصة', 'نقل الأثاث الثقيل بين الطوابق'],
    },
  };

  // Services catalog (fixed-price). Prices/names match the product spec exactly
  // (Figma "Data reference"): the catalogue the customer sees upfront.
  const SERVICE_CATALOG = [
    { id: '00000000-0000-0000-0000-000000000001', nameAr: 'كهرباء',       nameEn: 'Electricity', category: 'ELECTRICAL', priceJod: 50, durationMin: 45 },
    { id: '00000000-0000-0000-0000-000000000002', nameAr: 'سباكة',        nameEn: 'Plumbing',    category: 'PLUMBING',   priceJod: 40, durationMin: 60 },
    { id: '00000000-0000-0000-0000-000000000003', nameAr: 'تنظيف تكييف',  nameEn: 'AC Cleaning', category: 'HVAC',       priceJod: 30, durationMin: 45 },
    { id: '00000000-0000-0000-0000-000000000004', nameAr: 'دهان',         nameEn: 'Painting',    category: 'PAINTING',   priceJod: 70, durationMin: 180 },
    { id: '00000000-0000-0000-0000-000000000005', nameAr: 'تركيب أثاث',   nameEn: 'Furniture',   category: 'CARPENTRY',  priceJod: 35, durationMin: 60 },
  ];

  const services = await Promise.all(
    SERVICE_CATALOG.map((s) => {
      const sop = SOP_BY_CATEGORY[s.category] ?? { sopIncludes: [], sopExcludes: [] };
      return prisma.service.upsert({
        where: { id: s.id },
        // Keep the catalogue authoritative: re-running the seed corrects prices.
        update: { nameAr: s.nameAr, nameEn: s.nameEn, category: s.category, priceJod: s.priceJod, durationMin: s.durationMin, ...sop },
        create: { ...s, ...sop },
      });
    }),
  );

  logger.info({ count: services.length }, 'Services seeded');

  // Promo codes (real business data — validated/applied at booking time).
  await Promise.all([
    prisma.promoCode.upsert({
      where: { code: 'WELCOME10' },
      update: {},
      create: { code: 'WELCOME10', type: 'PERCENT', value: 10, perUserLimit: 1, isActive: true },
    }),
    prisma.promoCode.upsert({
      where: { code: 'FIXLY5' },
      update: {},
      create: { code: 'FIXLY5', type: 'FIXED', value: 5, minOrderJod: 30, perUserLimit: 3, isActive: true },
    }),
  ]);
  logger.info('Promo codes seeded');

  // Sample customer + technician are DEV/TEST fixtures only. Production must
  // never carry fabricated users — real customers come from OTP signup and real
  // technicians from the onboarding/approval flow. Guard so prod stays clean.
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    await prisma.user.upsert({
      where: { phone: '+962799000001' },
      update: {},
      create: { phone: '+962799000001', name: 'أحمد الطالب', role: 'CUSTOMER' },
    });

    const techUser = await prisma.user.upsert({
      where: { phone: '+962799000002' },
      update: {},
      create: { phone: '+962799000002', name: 'محمد الفني', role: 'TECHNICIAN' },
    });

    await prisma.technicianProfile.upsert({
      where: { userId: techUser.id },
      update: { status: 'APPROVED', isVerified: true, services: { set: services.map((s) => ({ id: s.id })) } },
      create: {
        userId: techUser.id,
        status: 'APPROVED',
        approvedAt: new Date(),
        isVerified: true,
        isAvailable: true,
        hourlyRateJod: 45,
        vehicle: 'Hyundai H1 — أبيض',
        currentLat: 31.9522,
        currentLng: 35.9331,
        rating: 4.8,
        totalReviews: 42,
        services: { connect: services.map((s) => ({ id: s.id })) },
      },
    });

    logger.info('Sample dev users seeded (non-production)');
  }

  // Admin user — credentials come from env so we never bake a known password
  // into the repo. Production REQUIRES an explicit, strong ADMIN_PASSWORD;
  // local dev may fall back to a clearly-labelled default.
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
    // Ensure the bootstrap admin is SUPER_ADMIN even on an existing row (the
    // column default is least-privilege SUPPORT, so it must be set explicitly).
    update: { role: 'SUPER_ADMIN' },
    create: {
      email: adminEmail,
      passwordHash,
      name: 'مدير Fixly',
      role: 'SUPER_ADMIN',
    },
  });

  logger.info({ adminEmailFp: createHash('sha256').update(adminEmail).digest('hex').slice(0, 12) }, 'Admin user seeded');
  logger.info('Seed complete');
}

seed()
  .catch((e) => {
    logger.error(e, 'Seed failed');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
