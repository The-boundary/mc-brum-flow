import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Internal Server Error');
  const statusCode = (err as AppError)?.statusCode || 500;
  logger.error({ err: error, requestId: req.headers['x-request-id'], path: req.path, method: req.method });
  res.status(statusCode).json({
    error: { message: error.message || 'Internal Server Error', ...(config.nodeEnv === 'development' && { stack: error.stack }) },
    meta: { timestamp: new Date().toISOString(), requestId: req.headers['x-request-id'] || 'unknown' },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { message: `Not found: ${req.method} ${req.path}` },
    meta: { timestamp: new Date().toISOString(), requestId: req.headers['x-request-id'] || 'unknown' },
  });
}
