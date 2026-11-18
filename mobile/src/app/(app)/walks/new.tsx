import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { organizingOrganizations, useMyOrganizations } from '@/api/organizations';
import { useCreateWalk } from '@/api/walks';
import { Screen, WalkForm } from '@/components';
import { defaultWalkStart } from '@/lib/dates';
import { emptyWalkForm, toCreateWalkRequest } from '@/lib/forms';
import { DEFAULT_CENTER } from '@/lib/geo';
import { useUserLocation } from '@/lib/location';
import { offerNotifications } from '@/notifications';
import { t } from '@/strings';

/**
 * Create a walk; the map starts at the user's position (or the default centre,
 * with a warning), and the pin must be placed by the person before submitting.
 */
export default function NewWalkScreen() {
  const router = useRouter();
  const createWalk = useCreateWalk();
  const location = useUserLocation();
  const mine = useMyOrganizations();
  const organizations = organizingOrganizations(mine.data).map(({ organization }) => ({
    id: organization.id,
    name: organization.name,
  }));
  const [initial] = useState(() => emptyWalkForm(DEFAULT_CENTER, defaultWalkStart()));

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.walk.newTitle }} />
      <WalkForm
        initial={initial}
        userLocation={location.coords}
        locationStatus={location.status}
        allowRepeat
        organizations={organizations}
        submitLabel={t.walk.create}
        onSubmit={async (values) => {
          const walk = await createWalk.mutateAsync(toCreateWalkRequest(values));
          void offerNotifications();
          router.replace({ pathname: '/walks/[id]', params: { id: walk.id } });
        }}
      />
    </Screen>
  );
}
