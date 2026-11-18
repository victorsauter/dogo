import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Light haptic feedback, as iOS gives it: a « tick » when a choice changes
 * (menu item, panel height, pin) and a light tap when a menu opens. Never
 * blocks nor fails: no haptics on web, errors (no engine) are ignored.
 */
export const haptics = {
  selection() {
    if (Platform.OS === 'web') return;
    void Haptics.selectionAsync().catch(() => undefined);
  },
  lightImpact() {
    if (Platform.OS === 'web') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
};
