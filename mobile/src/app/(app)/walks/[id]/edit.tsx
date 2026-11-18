import { Stack, useLocalSearchParams } from 'expo-router';

import { useUpdateWalk, useWalk } from '@/api/walks';
import { ErrorState, LoadingState, Screen, WalkForm } from '@/components';
import { walkTiming } from '@/lib/dates';
import { toUpdateWalkRequest, walkFormFrom } from '@/lib/forms';
import { useFocusedRouter } from '@/lib/hooks';
import { t } from '@/strings';

/** Edit a walk: organizer only, before it starts (spec §4.2). */
export default function EditWalkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useFocusedRouter();
  const walk = useWalk(id);
  const updateWalk = useUpdateWalk(id);

  if (walk.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (walk.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={walk.error} onRetry={() => walk.refetch()} />
      </Screen>
    );
  }
  const editable = walk.data.status === 'Scheduled' && walkTiming(walk.data) === 'upcoming';
  if (!walk.data.isOrganizer || !editable) {
    return (
      <Screen scroll={false}>
        <ErrorState message={walk.data.isOrganizer ? t.walk.notEditable : t.walk.notOrganizer} />
      </Screen>
    );
  }
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.walk.editTitle }} />
      <WalkForm
        key={walk.data.id}
        initial={walkFormFrom(walk.data)}
        pinPlaced
        submitLabel={t.common.save}
        onSubmit={async (values) => {
          await updateWalk.mutateAsync(toUpdateWalkRequest(values));
          router.back();
        }}
      />
    </Screen>
  );
}
