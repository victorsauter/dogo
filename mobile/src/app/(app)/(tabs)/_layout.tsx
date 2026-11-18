import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components';
import { t } from '@/strings';
import { useTheme } from '@/theme';

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon name={name} color={color} size={size} />;
  };
}

/**
 * Screens are declared in the order Expo Router sorts the route files (index,
 * then by name length: `mine` before `profile`), which is also the tab order.
 * A different order makes the navigator report a ROUTE_NAMES_CHANGED action
 * « not handled by any navigator » at start-up (ADR 0026).
 */
export default function AppTabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabs.discover, tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen
        name="mine"
        options={{ title: t.tabs.myWalks, tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t.tabs.profile, tabBarIcon: tabIcon('person') }}
      />
    </Tabs>
  );
}
