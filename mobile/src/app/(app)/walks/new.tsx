import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { useCreateWalk } from '@/api/walks';
import { Screen, WalkForm } from '@/components';
import { defaultWalkStart } from '@/lib/dates';
import { emptyWalkForm, toCreateWalkRequest } from '@/lib/forms';
import { DEFAULT_CENTER } from '@/lib/geo';
import { useUserLocation } from '@/lib/location';
import { t } from '@/strings';

/** Create a walk; the meeting point starts at the user's position (or the default centre). */
export default function NewWalkScreen() {
  const router = useRouter();
  const createWalk = useCreateWalk();
  const location = useUserLocation();
  const [initial] = useState(() => emptyWalkForm(DEFAULT_CENTER, defaultWalkStart()));

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.walk.newTitle }} />
      <WalkForm
        initial={initial}
        userLocation={location.coords}
        submitLabel={t.walk.create}
        onSubmit={async (values) => {
          const walk = await createWalk.mutateAsync(toCreateWalkRequest(values));
          router.replace({ pathname: '/walks/[id]', params: { id: walk.id } });
        }}
      />
    </Screen>
  );
}
