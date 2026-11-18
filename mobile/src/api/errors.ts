import { t, type ApiErrorCode } from '@/strings';

import type { ProblemDetails } from './types';

export type ApiErrorKind = 'http' | 'network';

/** Failure of an API call, with a French message ready to display. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status; `undefined` for network failures. */
  readonly status?: number;
  /** Stable `code` extension of the problem response, e.g. `walk.full`. */
  readonly code?: string;
  /** Validation errors by field (`validation.failed`). */
  readonly fieldErrors: Record<string, string[]>;
  readonly problem?: ProblemDetails;

  constructor(init: {
    kind: ApiErrorKind;
    status?: number;
    problem?: ProblemDetails;
    cause?: unknown;
  }) {
    const message = messageFor(init.kind, init.status, init.problem?.code);
    super(message, { cause: init.cause });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.problem = init.problem;
    this.code = init.problem?.code;
    this.fieldErrors = init.problem?.errors ?? {};
  }

  /** True for 4xx responses: retrying the same request will not help. */
  get isClientError(): boolean {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }
}

function isKnownCode(code: string | undefined): code is ApiErrorCode {
  return code !== undefined && Object.hasOwn(t.errors, code) && code.includes('.');
}

function messageFor(kind: ApiErrorKind, status?: number, code?: string): string {
  if (kind === 'network') return t.errors.network;
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
  });
}

/**
 * Normalizes anything thrown or returned by an API call into an `ApiError`:
 * an `ApiError` is kept, a problem body returned by openapi-fetch (`error`) is
 * wrapped with its status, and anything else is treated as a network failure.
 */
export function toApiError(error: unknown, response?: Response): ApiError {
  if (error instanceof ApiError) return error;
  if (response && !response.ok) {
    const problem =
      error !== null && typeof error === 'object' ? (error as ProblemDetails) : undefined;
    return new ApiError({ kind: 'http', status: response.status, problem });
  }
  return new ApiError({ kind: 'network', cause: error });
}

/** French message for any error, for display in `ErrorState` or a field. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : t.errors.generic;
}
