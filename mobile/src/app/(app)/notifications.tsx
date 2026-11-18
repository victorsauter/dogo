import { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import {
  preferenceNames,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type PreferenceName,
} from '@/api/notifications';
import { Button, Card, ErrorState, LoadingState, Screen, SwitchRow, Text } from '@/components';
import { enableNotifications, getPermissionState, type PermissionState } from '@/notifications';
import { t } from '@/strings';

const labels: Record<PreferenceName, { label: string; hint: string }> = {
  registrations: { label: t.notifications.registrations, hint: t.notifications.registrationsHint },
  walkChanges: { label: t.notifications.walkChanges, hint: t.notifications.walkChangesHint },
  messages: { label: t.notifications.messages, hint: t.notifications.messagesHint },
  reminders: { label: t.notifications.reminders, hint: t.notifications.remindersHint },
};

const permissionText: Record<PermissionState, string> = {
  granted: t.notifications.systemGranted,
  denied: t.notifications.systemDenied,
  undetermined: t.notifications.systemUndetermined,
  unavailable: t.notifications.systemUnavailable,
};

/** System permission state, refreshed when the app comes back from the system settings. */
function usePermissionState() {
  const [state, setState] = useState<PermissionState | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => void getPermissionState().then((next) => active && setState(next));
    refresh();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return [state, setState] as const;
}

/** Which notifications I receive (saved at once), and the permission of this phone. */
export default function NotificationSettingsScreen() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [permission, setPermission] = usePermissionState();
  const [error, setError] = useState<string | null>(null);

  if (preferences.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (preferences.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={preferences.error} onRetry={() => preferences.refetch()} />
      </Screen>
    );
  }
  const values = preferences.data;

  function toggle(name: PreferenceName, value: boolean) {
    setError(null);
    update.mutate(
      { ...values, [name]: value },
      { onError: () => setError(t.notifications.saveFailed) },
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Card>
        {preferenceNames.map((name) => (
          <SwitchRow
            key={name}
            label={labels[name].label}
            description={labels[name].hint}
            value={values[name]}
            onValueChange={(value) => toggle(name, value)}
          />
        ))}
        {error ? (
          <Text color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="heading">{t.notifications.systemTitle}</Text>
        {permission ? <Text color="textMuted">{permissionText[permission]}</Text> : null}
        {permission === 'denied' ? (
          <Button
            label={t.notifications.openSettings}
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
        {permission === 'undetermined' ? (
          <Button
            label={t.notifications.enable}
            variant="secondary"
            onPress={() => void enableNotifications().then(setPermission)}
          />
        ) : null}
      </Card>
    </Screen>
  );
}
