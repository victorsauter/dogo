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
        name="my-walks"
        options={{ title: t.tabs.myWalks, tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t.tabs.profile, tabBarIcon: tabIcon('person') }}
      />
    </Tabs>
  );
}
