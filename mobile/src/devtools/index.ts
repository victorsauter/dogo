import type { ComponentType } from 'react';

import { config } from '@/lib/config';

import type { DemoDataSectionProps } from './DemoDataSection';

/**
 * Development tools, kept apart from the app: the demo data section of the
 * sign-in screen (ADR 0027). Required only when `EXPO_PUBLIC_DEV_LOGIN` is
 * `true`, like the test sign-in; otherwise none of this code runs.
 */
export function loadDemoDataSection(): ComponentType<DemoDataSectionProps> | null {
  if (!config.devLogin) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: development builds with the test sign-in only
  return (require('./DemoDataSection') as typeof import('./DemoDataSection')).DemoDataSection;
}
