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

/** Leaves the screen: back when there is a screen to go back to (a deep link has none), else home. */
export function leaveScreen(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Error of a screen. A transient failure offers « Réessayer »; a definitive
 * one (404, 403…) offers « Retour » instead, since asking again is useless.
 */
export function ErrorState({ error, message, onRetry }: ErrorStateProps) {
  const definitive = isDefinitiveError(error);
  return (
    <EmptyState
      icon={errorIcon(error)}
      title={t.states.errorTitle}
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
