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

export function ErrorState({ error, message, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      icon={errorIcon(error)}
      title={t.states.errorTitle}
      message={message ?? errorMessage(error)}
      action={onRetry ? { label: t.common.retry, onPress: onRetry } : undefined}
    />
  );
}
