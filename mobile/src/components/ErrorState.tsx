import { errorMessage } from '@/api/errors';
import { t } from '@/strings';

import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  /** The error to explain (an `ApiError` gives a precise French message). */
  error?: unknown;
  /** Overrides the message derived from `error`. */
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, message, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      icon="offline"
      title={t.states.errorTitle}
      message={message ?? errorMessage(error)}
      action={onRetry ? { label: t.common.retry, onPress: onRetry } : undefined}
    />
  );
}
