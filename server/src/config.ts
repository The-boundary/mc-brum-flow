import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenvConfig({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z.object({
  PORT: z.string().default('4200'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5174'),
  CACHE_TTL: z.string().default('300'),
  MAX_HOST: z.string().default('127.0.0.1'),
  MAX_PORT: z.string().default('8765'),
  MAX_SYNC_DEBOUNCE_MS: z.string().default('250'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  corsOrigin: parsed.data.CORS_ORIGIN,
  cacheTtl: parseInt(parsed.data.CACHE_TTL, 10),
  maxHost: parsed.data.MAX_HOST,
  maxPort: parseInt(parsed.data.MAX_PORT, 10),
  maxSyncDebounceMs: parseInt(parsed.data.MAX_SYNC_DEBOUNCE_MS, 10),
} as const;
