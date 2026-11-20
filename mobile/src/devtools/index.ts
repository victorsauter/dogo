import type { ComponentType } from 'react';

import { config } from '@/lib/config';

import type { DemoDataSectionProps } from './DemoDataSection';

/**
 * Development tools, kept apart from the app: the demo data section of the
 * sign-in screen (ADR 0027). Required only when the test sign-in is on
 * (`config.devLogin`: development build with `EXPO_PUBLIC_DEV_LOGIN=true`, or
 * demo build, ADR 0043); otherwise none of this code runs.
 */
export function loadDemoDataSection(): ComponentType<DemoDataSectionProps> | null {
  if (!config.devLogin) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: builds with the test sign-in only
  return (require('./DemoDataSection') as typeof import('./DemoDataSection')).DemoDataSection;
}
