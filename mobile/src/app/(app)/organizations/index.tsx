import { useState } from 'react';
import { FlatList } from 'react-native';

import { useGuardedRouter } from '@/lib/navigation';
import { useOrganizationSearch } from '@/api/organizations';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OrganizationCard,
  Screen,
  TextField,
} from '@/components';
import { useDebouncedValue } from '@/lib/hooks';
import { t } from '@/strings';
import { useTheme } from '@/theme';

/** Search for approved organisations by name or city (`GET /organizations?query`). */
export default function FindOrganizationScreen() {
  const router = useGuardedRouter();
  const { spacing } = useTheme();
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), 400);
  const results = useOrganizationSearch(query);

  return (
    <Screen scroll={false} edges={['left', 'right', 'bottom']}>
      <TextField
        label={t.organization.searchLabel}
        value={text}
        onChangeText={setText}
        hint={t.organization.searchHint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={80}
      />
      {results.isPending ? (
        <LoadingState />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : (
        <FlatList
          data={results.data}
          keyExtractor={(organization) => organization.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.md, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              icon="map"
              title={t.organization.searchEmptyTitle}
              message={t.organization.searchEmptyMessage}
            />
          }
          renderItem={({ item }) => (
            <OrganizationCard
              organization={item}
              onPress={() =>
                router.push({ pathname: '/organizations/[id]', params: { id: item.id } })
              }
            />
          )}
        />
      )}
    </Screen>
  );
}
