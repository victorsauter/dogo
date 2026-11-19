import { format, t, type ApiErrorCode } from '@/strings';

import type { ProblemDetails } from './types';

/**
 * `http`: the API answered with an error. `network`: the request could not
 * reach the API. `client`: the app failed before or after the exchange (body
 * encoding, unreadable response…), which must not be reported as a network issue.
 */
export type ApiErrorKind = 'http' | 'network' | 'client';

/** Failure of an API call, with a French message ready to display. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status; `undefined` for network and client failures. */
  readonly status?: number;
  /** Stable `code` extension of the problem response, e.g. `walk.full`. */
  readonly code?: string;
  /** Validation errors by field (`validation.failed`). */
  readonly fieldErrors: Record<string, string[]>;
  readonly problem?: ProblemDetails;
  /** `network` failure because the request took longer than its time limit. */
  readonly timedOut: boolean;
  /** Seconds to wait before trying again, from the `Retry-After` header of a 429. */
  readonly retryAfterSeconds?: number;

  constructor(init: {
    kind: ApiErrorKind;
    status?: number;
    problem?: ProblemDetails;
    cause?: unknown;
    timedOut?: boolean;
    retryAfterSeconds?: number;
  }) {
    const timedOut = init.kind === 'network' && init.timedOut === true;
    const message = timedOut
      ? t.errors.timeout
      : messageFor(init.kind, init.status, init.problem?.code, init.retryAfterSeconds);
    super(message, { cause: init.cause });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.timedOut = timedOut;
    this.status = init.status;
    this.problem = init.problem;
    this.code = init.problem?.code;
    this.fieldErrors = init.problem?.errors ?? {};
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  /** True for 4xx responses: retrying the same request will not help. */
  get isClientError(): boolean {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }
}

function isKnownCode(code: string | undefined): code is ApiErrorCode {
  return code !== undefined && Object.hasOwn(t.errors, code) && code.includes('.');
}

/** Longest wait worth announcing; beyond it the vague message is clearer. */
const MAX_ANNOUNCED_RETRY_SECONDS = 300;

/**
 * Delay of a `Retry-After` header given in seconds (the API sends seconds; an
 * HTTP date is ignored). `undefined` when absent or not a positive number.
 */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value || !/^\s*\d+\s*$/.test(value)) return undefined;
  const seconds = Number.parseInt(value, 10);
  return seconds > 0 ? seconds : undefined;
}

function messageFor(
  kind: ApiErrorKind,
  status?: number,
  code?: string,
  retryAfterSeconds?: number,
): string {
  if (kind === 'network') return t.errors.network;
  if (kind === 'client') return t.errors.unexpected;
  // Rate limiting (problem+json `rate_limit.exceeded` with `Retry-After`), or a proxy doing the same.
  if (status === 429) {
    return retryAfterSeconds !== undefined && retryAfterSeconds <= MAX_ANNOUNCED_RETRY_SECONDS
      ? format(t.errors.tooManyRequestsIn, { seconds: retryAfterSeconds })
      : t.errors.tooManyRequests;
  }
  if (isKnownCode(code)) return t.errors[code];
  if (status === 404) return t.errors.notFound;
  if (status === 403) return t.errors.forbidden;
  if (status !== undefined && status >= 500) return t.errors.server;
  return t.errors.generic;
}

async function readProblem(response: Response): Promise<ProblemDetails | undefined> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    const body: unknown = JSON.parse(text);
    return body !== null && typeof body === 'object' ? (body as ProblemDetails) : undefined;
  } catch {
    return undefined;
  }
}

/** Builds an `ApiError` from a failed response (problem JSON or not). Consumes the body. */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  return new ApiError({
    kind: 'http',
    status: response.status,
    problem: await readProblem(response),
    retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
  });
}

/**
 * Messages of the errors thrown by the network layers when the server cannot
 * be reached: `expo/fetch` (« fetch failed: … »), React Native's and
 * whatwg-fetch (« Network request failed »), timeouts and aborts.
 */
const NETWORK_FAILURE =
  /fetch failed|network request failed|network error|timed? ?out|offline|aborted/i;

const ABORT_NAMES = new Set(['AbortError', 'TimeoutError']);

/**
 * True when a thrown value means the request did not reach the server. Abort
 * and timeout errors are recognized by name, not only by message: `expo/fetch`
 * wraps them in a `FetchError` whose `cause` is the abort reason, and a
 * `DOMException` is not always an `Error` instance (Hermes). Requests that
 * exceed their time limit are already turned into an `ApiError` by `authFetch`.
 */
export function isNetworkFailure(error: unknown, depth = 0): boolean {
  if (error === null || typeof error !== 'object' || depth > 3) return false;
  const { name, message, cause } = error as { name?: unknown; message?: unknown; cause?: unknown };
  if (typeof name === 'string' && ABORT_NAMES.has(name)) return true;
  if (error instanceof Error && NETWORK_FAILURE.test(String(message))) return true;
  return cause !== undefined && isNetworkFailure(cause, depth + 1);
}

/**
 * Normalizes anything thrown or returned by an API call into an `ApiError`:
 * an `ApiError` is kept, a problem body returned by openapi-fetch (`error`) is
 * wrapped with its status, a thrown network failure becomes `network`, and any
 * other thrown error (a bug or an unsupported body on the device) becomes
 * `client`, so it is never explained as « cannot reach the server ».
 */
export function toApiError(error: unknown, response?: Response): ApiError {
  if (error instanceof ApiError) return error;
  if (response && !response.ok) {
    const problem =
      error !== null && typeof error === 'object' ? (error as ProblemDetails) : undefined;
    return new ApiError({
      kind: 'http',
      status: response.status,
      problem,
      retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
    });
  }
  if (isNetworkFailure(error)) return new ApiError({ kind: 'network', cause: error });
  if (__DEV__) console.warn('Unexpected error during an API call', error);
  return new ApiError({ kind: 'client', cause: error });
}

/** French message for any error, for display in `ErrorState` or a field. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : t.errors.generic;
}
