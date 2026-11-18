import { Screen } from '@/components';
import { useDiscoverLayout } from '@/discover/layoutPreference';
import { ListLayout } from '@/discover/ListLayout';
import { PanelLayout } from '@/discover/PanelLayout';
import { useUserLocation } from '@/lib/location';

/**
 * « Balades » tab: the walks around the user. The view is the one chosen in the
 * profile settings, « Panneau » (map and sliding panel) by default or « Liste ».
 */
export default function DiscoverScreen() {
  const location = useUserLocation();
  const { layout } = useDiscoverLayout();

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={['top', 'left', 'right']}
      contentStyle={{ gap: 0 }}
    >
      {layout === 'list' ? (
        <ListLayout location={location} />
      ) : layout === 'panel' ? (
        <PanelLayout location={location} />
      ) : null}
    </Screen>
  );
}
