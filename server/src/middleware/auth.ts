import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getAuthSupabaseClient } from '../services/supabase.js';

const APP_SLUG = process.env.APP_SLUG || 'brum-flow';

type AppAccess = {
  role_slug: string | null;
  is_admin: boolean | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
        aud?: string;
        exp?: number;
        appAccess?: AppAccess | null;
      };
    }
  }
}

const ALLOWED_DOMAINS = (process.env.GOOGLE_WORKSPACE_DOMAIN || 'the-boundary.com')
  .split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

const isEmailDomainAllowed = (email?: string | null): boolean => {
  if (ALLOWED_DOMAINS.length === 0) return true;
  if (!email) return false;
  return ALLOWED_DOMAINS.some(domain => email.toLowerCase().endsWith(`@${domain}`));
};

const extractToken = (req: Request): string | null => {
  const cookieToken = req.cookies?.tb_access_token;
  if (typeof cookieToken === 'string' && cookieToken.trim()) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
    if (parts.length === 1) return parts[0];
  }
  const tokenParam = req.query.access_token;
  if (typeof tokenParam === 'string' && tokenParam.trim()) return tokenParam;
  return null;
};

interface SupabaseTokenPayload {
  sub: string;
  email?: string;
  aud?: string;
  exp?: number;
  role?: string;
  user_metadata?: { role?: string };
}

const verifySupabaseToken = (token: string): SupabaseTokenPayload => {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) throw new Error('SUPABASE_JWT_SECRET not configured');
  return jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as SupabaseTokenPayload;
};

const ensureAppAccess = async (userId: string): Promise<AppAccess> => {
  const supabase = getAuthSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('effective_user_app_access_view')
    .select('role_slug,is_admin')
    .eq('user_id', userId)
    .eq('app_slug', APP_SLUG)
    .eq('is_active', true)
    .eq('app_is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Access to ${APP_SLUG} is not enabled for this user`);
  return data as AppAccess;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true') {
    req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'dev@the-boundary.com', role: 'admin', aud: 'authenticated', appAccess: { role_slug: 'admin', is_admin: true } };
    return next();
  }

  const serviceTokenEnv = process.env.SERVICE_API_TOKEN;
  const rawServiceToken = (req.headers['x-service-api-token'] || req.headers['x-service-token'] || req.headers['service-api-token']) as string | string[] | undefined;
  const providedServiceToken = Array.isArray(rawServiceToken) ? rawServiceToken[0] : rawServiceToken;
  if (serviceTokenEnv && providedServiceToken === serviceTokenEnv) {
    req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'service@local.internal', role: 'service', aud: 'authenticated', appAccess: { role_slug: 'admin', is_admin: true } };
    return next();
  }

  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: { message: 'No authentication token provided' } });

  let decoded: SupabaseTokenPayload;
  try {
    decoded = verifySupabaseToken(token);
  } catch {
    return res.status(401).json({ error: { message: 'Invalid token' } });
  }

  if (!isEmailDomainAllowed(decoded.email)) {
    return res.status(403).json({ error: { message: 'Email domain not allowed' } });
  }

  req.user = { id: decoded.sub, email: decoded.email, role: decoded.user_metadata?.role || decoded.role, aud: decoded.aud, exp: decoded.exp };

  try {
    const appAccess = await ensureAppAccess(req.user.id);
    req.user.appAccess = appAccess;
    if (appAccess.role_slug) req.user.role = appAccess.role_slug;
  } catch (error) {
    return res.status(403).json({ error: { message: error instanceof Error ? error.message : 'Access denied' } });
  }

  next();
};
