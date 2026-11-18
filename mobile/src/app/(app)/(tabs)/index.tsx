import { Screen } from '@/components';
import { CurrentLayout } from '@/discover/CurrentLayout';
import { LayoutSelector } from '@/discover/LayoutSelector';
import { useDiscoverLayout } from '@/discover/layoutPreference';
import { ListLayout } from '@/discover/ListLayout';
import { PanelLayout } from '@/discover/PanelLayout';
import { useUserLocation } from '@/lib/location';

/**
 * « Balades » tab: the walks around the user, on a map and in a list. The
 * layout is the current one (map above the list) unless the prototype selector,
 * shown only with EXPO_PUBLIC_DEV_LOGIN, picks « Liste » or « Panneau ».
 */
export default function DiscoverScreen() {
  const location = useUserLocation();
  const { enabled, layout, setLayout } = useDiscoverLayout();

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={['top', 'left', 'right']}
      contentStyle={{ gap: 0 }}
    >
      {enabled && layout ? <LayoutSelector value={layout} onChange={setLayout} /> : null}
      {layout === 'list' ? (
        <ListLayout location={location} />
      ) : layout === 'panel' ? (
        <PanelLayout location={location} />
      ) : layout === 'current' ? (
        <CurrentLayout location={location} />
      ) : null}
    </Screen>
  );
}
