import { useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/auth';
import { Avatar, Button, EmptyState, Screen, Text } from '@/components';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

export default function ProfileScreen() {
  const { user, signOut } = useSession();
  const { spacing } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const name = user?.displayName ?? '';

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Avatar name={name} photoUrl={user?.photoUrl} size={88} />
        <Text variant="heading" align="center">
          {format(t.profile.greeting, { name })}
        </Text>
      </View>
      <EmptyState icon="paw" title={t.profile.emptyTitle} message={t.profile.emptyMessage} />
      <Button
        label={t.auth.signOut}
        variant="danger"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
    </Screen>
  );
}
