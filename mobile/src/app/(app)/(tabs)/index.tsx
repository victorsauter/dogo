import { Screen } from '@/components';
import { useDiscoverLayout } from '@/discover/layoutPreference';
import { ListLayout } from '@/discover/ListLayout';
import { PanelLayout } from '@/discover/PanelLayout';
import { useDiscoverFilterState } from '@/discover/shared';
import { useUserLocation } from '@/lib/location';

/**
 * « Balades » tab: the walks around the user. The view is the one chosen in the
 * profile settings, « Panneau » (map and sliding panel) by default or « Liste ».
 * The filters live here, so changing the view keeps them for the session. The
 * views reach under the status bar themselves (the map runs to the top).
 */
export default function DiscoverScreen() {
  const location = useUserLocation();
  const { layout } = useDiscoverLayout();
  const filters = useDiscoverFilterState();

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']} contentStyle={{ gap: 0 }}>
      {layout === 'list' ? (
        <ListLayout location={location} filterState={filters} />
      ) : layout === 'panel' ? (
        <PanelLayout location={location} filterState={filters} />
      ) : null}
    </Screen>
  );
}
