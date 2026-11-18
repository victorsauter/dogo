import type { SessionUser } from '@/api/types';

/** Display name given by the API to an account created without a name (spec §1, lot 1). */
export const DEFAULT_DISPLAY_NAME = 'Nouveau membre';

const shown = new Set<string>();

/**
 * True once per user and app launch when the display name is still the API
 * default: the app then opens the edit-profile screen with a welcome sentence.
 */
export function shouldShowWelcome(user: SessionUser): boolean {
  if (user.displayName !== DEFAULT_DISPLAY_NAME || shown.has(user.id)) return false;
  shown.add(user.id);
  return true;
}

/** Forgets what was shown (tests). */
export function resetWelcomeNudge(): void {
  shown.clear();
}
