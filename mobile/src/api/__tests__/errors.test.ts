import { problemResponse } from '@/test/fixtures';
import { t } from '@/strings';

import { ApiError, apiErrorFromResponse, errorMessage, toApiError } from '../errors';

describe('apiErrorFromResponse', () => {
  it('maps a known problem code to its French message', async () => {
    const error = await apiErrorFromResponse(problemResponse(409, 'walk.full'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('http');
    expect(error.status).toBe(409);
    expect(error.code).toBe('walk.full');
    expect(error.message).toBe(t.errors['walk.full']);
    expect(error.isClientError).toBe(true);
  });

  it('keeps validation errors by field', async () => {
    const error = await apiErrorFromResponse(
      problemResponse(400, 'validation.failed', { errors: { name: ['Requis'] } }),
    );
    expect(error.message).toBe(t.errors['validation.failed']);
    expect(error.fieldErrors).toEqual({ name: ['Requis'] });
  });

  it('falls back on the status for unknown codes and non-JSON bodies', async () => {
    expect((await apiErrorFromResponse(problemResponse(404, 'dog.unknown'))).message).toBe(
      t.errors.notFound,
    );
    expect((await apiErrorFromResponse(new Response('boom', { status: 502 }))).message).toBe(
      t.errors.server,
    );
    expect((await apiErrorFromResponse(new Response('', { status: 418 }))).message).toBe(
      t.errors.generic,
    );
  });

  it('does not mistake fallback keys for API codes', async () => {
    const error = await apiErrorFromResponse(problemResponse(400, 'network'));
    expect(error.message).toBe(t.errors.generic);
  });
});

describe('toApiError', () => {
  it('treats a thrown fetch error as a network failure', () => {
    const error = toApiError(new TypeError('Network request failed'));
    expect(error.kind).toBe('network');
    expect(error.status).toBeUndefined();
    expect(error.isClientError).toBe(false);
    expect(error.message).toBe(t.errors.network);
  });

  it('wraps an openapi-fetch error body with its response status', () => {
    const error = toApiError({ code: 'account.suspended' }, new Response(null, { status: 403 }));
    expect(error.status).toBe(403);
    expect(error.message).toBe(t.errors['account.suspended']);
  });

  it('returns ApiError instances unchanged', () => {
    const original = new ApiError({ kind: 'network' });
    expect(toApiError(original)).toBe(original);
  });
});

describe('errorMessage', () => {
  it('gives the generic message for unknown errors', () => {
    expect(errorMessage(new Error('x'))).toBe(t.errors.generic);
    expect(errorMessage(new ApiError({ kind: 'network' }))).toBe(t.errors.network);
  });
});
