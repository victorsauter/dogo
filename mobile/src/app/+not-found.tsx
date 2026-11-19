import { useGuardedRouter } from '@/lib/navigation';
import { EmptyState, Screen } from '@/components';
import { t } from '@/strings';

/**
 * Shown for any address no route matches (`dogo://nimporte`), in place of
 * Expo Router's English « Unmatched route » screen. Signed-out users land on
 * the sign-in screen from `/`, the auth gate sends them there.
 */
export default function NotFoundScreen() {
  const router = useGuardedRouter();
  return (
    <Screen scroll={false}>
      <EmptyState
        icon="map"
        title={t.states.notFoundTitle}
        message={t.states.notFoundMessage}
        action={{ label: t.states.notFoundHome, onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
