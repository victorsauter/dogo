import { router } from 'expo-router';

import { ApiError, errorMessage } from '@/api/errors';
import { t } from '@/strings';

import { EmptyState } from './EmptyState';
import type { IconName } from './Icon';

export interface ErrorStateProps {
  /** The error to explain (an `ApiError` gives a precise French message). */
  error?: unknown;
  /** Overrides the message derived from `error`. */
  message?: string;
  /**
   * Title when `error` is a 404 (« Balade introuvable »): the thing shown by the
   * screen does not exist, or no longer does. Without it, a generic « Introuvable ».
   */
  notFoundTitle?: string;
  onRetry?: () => void;
}

/**
 * The « hors ligne » icon is for a request that did not reach the server; any
 * other error (a 404, a refusal, a server fault) gets the warning.
 */
export function errorIcon(error: unknown): IconName {
  return error instanceof ApiError && error.kind === 'network' ? 'offline' : 'warning';
}

/**
 * True when asking again will not change the answer: the server understood and
 * refused (a walk that does not exist, a page the person may not see). A
 * timeout (408) and rate limiting (429) are the 4xx that may pass later.
 */
export function isDefinitiveError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

/** True for a 404: what the screen shows does not exist (or is hidden from this person). */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === 404;
}

/** Leaves the screen: back when there is a screen to go back to (a deep link has none), else home. */
export function leaveScreen(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Error of a screen. A transient failure offers « Réessayer »; a definitive
 * one (404, 403…) offers « Retour » instead, since asking again is useless. A
 * 404 is not « a problem »: its title says the thing cannot be found.
 */
export function ErrorState({ error, message, notFoundTitle, onRetry }: ErrorStateProps) {
  const definitive = isDefinitiveError(error);
  const title = isNotFoundError(error)
    ? (notFoundTitle ?? t.states.missingTitle)
    : t.states.errorTitle;
  return (
    <EmptyState
      icon={errorIcon(error)}
      title={title}
      message={message ?? errorMessage(error)}
      action={
        definitive
          ? { label: t.common.back, onPress: leaveScreen }
          : onRetry
            ? { label: t.common.retry, onPress: onRetry }
            : undefined
      }
    />
  );
}
