import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, fetchScenes, deleteScene } from './api';

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

describe('request() via fetchScenes', () => {

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns data from a successful response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [{ id: '1' }] }),
    });
    const result = await fetchScenes();
    expect(result).toEqual([{ id: '1' }]);
  });

  it('throws when success is not true', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'foo' }),
    });
    await expect(fetchScenes()).rejects.toThrow('unexpected response format');
  });

  it('throws when success is true but data is missing', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    await expect(fetchScenes()).rejects.toThrow('response missing data field');
  });

  it('includes rawBody when non-OK response is not valid JSON', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('<html>Bad Gateway</html>'),
    });
    try {
      await fetchScenes();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(502);
      expect((err as ApiError).details?.rawBody).toBe('<html>Bad Gateway</html>');
    }
  });

  it('parses JSON error body on non-OK response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'Scene not found', code: 'NOT_FOUND' } })),
    });
    try {
      await fetchScenes();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Scene not found');
      expect((err as ApiError).code).toBe('NOT_FOUND');
    }
  });
});

describe('requestVoid() via deleteScene', () => {

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('succeeds with { success: true } and no data field', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    await expect(deleteScene('abc')).resolves.toBeUndefined();
  });

  it('throws when success is false', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: 'Not allowed' }),
    });
    await expect(deleteScene('abc')).rejects.toThrow();
  });
});
