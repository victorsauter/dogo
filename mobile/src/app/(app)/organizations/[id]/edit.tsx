import { Stack, useLocalSearchParams } from 'expo-router';

import { useGuardedRouter } from '@/lib/navigation';
import { useOrganization, useUpdateOrganization } from '@/api/organizations';
import { ErrorState, LoadingState, OrganizationForm, Screen } from '@/components';
import { t } from '@/strings';

/** The owner edits the organisation (name, description, city). */
export default function EditOrganizationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useGuardedRouter();
  const organization = useOrganization(id);
  const update = useUpdateOrganization(id);

  if (organization.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (organization.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState
          error={organization.error}
          notFoundTitle={t.organization.notFoundTitle}
          onRetry={() => organization.refetch()}
        />
      </Screen>
    );
  }
  const { name, description, city } = organization.data;
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.organization.editTitle }} />
      <OrganizationForm
        initial={{ name, description, city: city ?? '' }}
        submitLabel={t.common.save}
        onSubmit={async (values) => {
          await update.mutateAsync(values);
          router.back();
        }}
      />
    </Screen>
  );
}
