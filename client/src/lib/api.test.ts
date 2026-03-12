import { describe, it, expect } from 'vitest';
import { ApiError } from './api';

describe('ApiError', () => {
  it('creates an error with default status 500', () => {
    const err = new ApiError('Something went wrong');
    expect(err.message).toBe('Something went wrong');
    expect(err.status).toBe(500);
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
    expect(err.name).toBe('ApiError');
  });

  it('accepts a custom status', () => {
    const err = new ApiError('Not found', { status: 404 });
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('accepts a custom error code', () => {
    const err = new ApiError('Unauthorized', { status: 401, code: 'AUTH_REQUIRED' });
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.status).toBe(401);
  });

  it('accepts details object', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const err = new ApiError('Validation failed', { status: 422, code: 'VALIDATION', details });
    expect(err.details).toEqual(details);
  });

  it('is an instance of Error', () => {
    const err = new ApiError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('has a stack trace', () => {
    const err = new ApiError('test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('ApiError');
  });

  it('defaults status to 500 when options is provided without status', () => {
    const err = new ApiError('oops', { code: 'UNKNOWN' });
    expect(err.status).toBe(500);
  });
});
