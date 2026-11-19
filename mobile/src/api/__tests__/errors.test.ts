import { jsonResponse, problemResponse } from '@/test/fixtures';
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

  it('explains a 429 (rate limiting) in French, with or without a problem body', async () => {
    const limited = await apiErrorFromResponse(
      jsonResponse({ status: 429, title: 'Too Many Requests' }, 429, 'application/problem+json'),
    );
    expect(limited.status).toBe(429);
    expect(limited.message).toBe(t.errors.tooManyRequests);
    expect((await apiErrorFromResponse(new Response('', { status: 429 }))).message).toBe(
      t.errors.tooManyRequests,
    );
  });

  it('announces the wait of a 429 when the API gives its Retry-After', async () => {
    const limited = new Response(JSON.stringify({ status: 429, code: 'rate_limit.exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '12' },
    });
    const error = await apiErrorFromResponse(limited);
    expect(error.code).toBe('rate_limit.exceeded');
    expect(error.retryAfterSeconds).toBe(12);
    expect(error.message).toBe('Trop de demandes d’un coup. Réessaie dans 12 s.');
    expect(error.isClientError).toBe(true);
  });

  it('keeps the vague message when Retry-After is absent, unreadable or very long', async () => {
    for (const value of [undefined, 'soon', '0', '-3', '86400']) {
      const response = new Response('', {
        status: 429,
        headers: value === undefined ? {} : { 'Retry-After': value },
      });
      expect((await apiErrorFromResponse(response)).message).toBe(t.errors.tooManyRequests);
    }
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

  it('recognizes the network failures of expo/fetch', () => {
    expect(
      toApiError(new Error('fetch failed: The Internet connection appears to be offline.')).kind,
    ).toBe('network');
    expect(toApiError(Object.assign(new Error('aborted'), { name: 'AbortError' })).kind).toBe(
      'network',
    );
  });

  it('recognizes an abort by timeout whatever its message or wrapper', () => {
    // DOMException-like value that is not an Error instance (Hermes).
    expect(toApiError({ name: 'TimeoutError', message: 'signal timed out' }).kind).toBe('network');
    // expo/fetch wraps the abort reason in a FetchError's cause.
    const reason = Object.assign(new Error('x'), { name: 'TimeoutError' });
    expect(toApiError(new Error('request cancelled', { cause: reason })).kind).toBe('network');
  });

  it('keeps the dedicated message of a timed-out request', () => {
    const error = new ApiError({ kind: 'network', timedOut: true });
    expect(error.timedOut).toBe(true);
    expect(error.message).toBe(t.errors.timeout);
    expect(toApiError(error)).toBe(error);
    expect(new ApiError({ kind: 'network' }).timedOut).toBe(false);
  });

  it('does not report an app-side failure as a network failure (defect D1)', () => {
    const error = toApiError(new Error('Unsupported FormDataPart implementation'));
    expect(error.kind).toBe('client');
    expect(error.message).toBe(t.errors.unexpected);
    expect(error.message).not.toBe(t.errors.network);
    expect(error.isClientError).toBe(false);
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
