import { EmptyState, Screen } from '@/components';
import { t } from '@/strings';

/** « Mes balades »: walks I organize or joined, lot 2. */
export default function MyWalksScreen() {
  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <EmptyState icon="calendar" title={t.myWalks.emptyTitle} message={t.myWalks.emptyMessage} />
    </Screen>
  );
}
