import { z } from 'zod';

/**
 * Конфигурация валидируется на старте. Приложение с неполным .env
 * должно падать сразу, а не через час на первом запросе к MinIO.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('Asia/Tashkent'),

  // Владелец схемы — используется миграциями и seed'ом, RLS его не ограничивает.
  DATABASE_URL: z.string().url(),
  // Прикладная роль — под ней работает рантайм, на неё действует RLS.
  // Если не задана, падаем обратно на DATABASE_URL, но громко предупреждаем.
  APP_DATABASE_URL: z.string().url().optional(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  API_PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),
  API_CORS_ORIGINS: z.string().default('http://localhost:5173'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET короче 32 символов'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET короче 32 символов'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@gsm.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin123!'),
  SEED_DEMO_DATA: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  timezone: string;
  database: {
    /** Соединение владельца схемы. Только для миграций и служебных задач. */
    ownerUrl: string;
    /** Соединение прикладной роли. Именно оно используется в рантайме. */
    appUrl: string;
    /** true, если рантайм ходит под владельцем — RLS в этом случае не работает. */
    rlsDisabled: boolean;
  };
  redis: { host: string; port: number; password?: string };
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
  api: { port: number; prefix: string; corsOrigins: string[] };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  security: { bcryptRounds: number };
  seed: { adminEmail: string; adminPassword: string; demoData: boolean };
}

export function loadConfiguration(): AppConfig {
  // Облачные платформы (Render, Railway, Fly) сами выбирают порт и передают его
  // в PORT, а слушать что-то другое означает, что балансировщик не достучится.
  // Свой API_PORT остаётся главнее: локальный .env не должен зависеть от того,
  // что где-то в окружении оказалась переменная PORT.
  const source: NodeJS.ProcessEnv = {
    ...process.env,
    API_PORT: process.env.API_PORT ?? process.env.PORT,
  };

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
  }

  const env = parsed.data;
  const appUrl = env.APP_DATABASE_URL ?? env.DATABASE_URL;

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    timezone: env.TZ,
    database: {
      ownerUrl: env.DATABASE_URL,
      appUrl,
      rlsDisabled: appUrl === env.DATABASE_URL,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
    },
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    },
    api: {
      port: env.API_PORT,
      prefix: env.API_PREFIX,
      corsOrigins: env.API_CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    security: { bcryptRounds: env.BCRYPT_ROUNDS },
    seed: {
      adminEmail: env.SEED_ADMIN_EMAIL,
      adminPassword: env.SEED_ADMIN_PASSWORD,
      demoData: env.SEED_DEMO_DATA,
    },
  };
}

/** Токен для инъекции: `@Inject(APP_CONFIG) private readonly config: AppConfig`. */
export const APP_CONFIG = 'APP_CONFIG';
