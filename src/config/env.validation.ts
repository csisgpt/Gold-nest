import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
      }
      return value;
    }, z.number().int().positive().default(3000)),
    DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().trim().min(1, 'JWT_SECRET is required'),
    JWT_EXPIRES_IN: z.string().trim().min(1).default('15m'),
    CORS_ORIGIN: z.string().trim().min(1, 'CORS_ORIGIN is required'),
    SWAGGER_ENABLED: z
      .preprocess((value) => {
        if (value === undefined || value === null) {
          return undefined;
        }
        if (typeof value === 'boolean') {
          return value;
        }
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true';
        }
        return undefined;
      }, z.boolean().optional()),
  })
  .passthrough()
  .transform((env) => ({
    ...env,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
  }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const formattedErrors = parsed.error.errors
      .map((err) => `${err.path.join('.') || 'environment'}: ${err.message}`)
      .join('; ');

    throw new Error(`Environment validation error: ${formattedErrors}`);
  }

  return parsed.data;
}
