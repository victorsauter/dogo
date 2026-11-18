import { EmptyState, Screen } from '@/components';
import { t } from '@/strings';

/** Discover tab (« Balades »): map and list of nearby walks, lot 2. */
export default function DiscoverScreen() {
  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <EmptyState icon="map" title={t.discover.emptyTitle} message={t.discover.emptyMessage} />
    </Screen>
  );
}
