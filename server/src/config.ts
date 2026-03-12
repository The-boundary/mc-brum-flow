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
  MAX_TCP_SERVER_PORT: z.string().default('8766'),
  MAX_SYNC_DEBOUNCE_MS: z.string().default('250'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.string().min(1, 'SUPABASE_URL is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_JWT_SECRET: z.string().min(1, 'SUPABASE_JWT_SECRET is required'),
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
  maxTcpServerPort: parseInt(parsed.data.MAX_TCP_SERVER_PORT, 10),
  maxSyncDebounceMs: parseInt(parsed.data.MAX_SYNC_DEBOUNCE_MS, 10),
  databaseUrl: parsed.data.DATABASE_URL,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  supabaseJwtSecret: parsed.data.SUPABASE_JWT_SECRET,
} as const;
