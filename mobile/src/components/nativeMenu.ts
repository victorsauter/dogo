import { requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import type { MenuComponentProps } from '@expo/ui/community/menu';

/**
 * The system menu of iOS (SwiftUI `Menu`, through `@expo/ui`, included in
 * Expo Go), or `null` where it is not used: Android and web (the app's own
 * menu, `AnchoredMenu`), an app without the native module, and the tests.
 * Loaded on demand: the module registers native views when it is imported.
 */
export const NativeMenuView: ComponentType<MenuComponentProps> | null =
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoUI') !== null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@expo/ui/community/menu') as typeof import('@expo/ui/community/menu')).MenuView
    : null;
