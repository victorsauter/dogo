import { Stack } from 'expo-router';

import { useGuardedRouter } from '@/lib/navigation';
import { useCreateOrganization } from '@/api/organizations';
import { OrganizationForm, Screen } from '@/components';
import { t } from '@/strings';

/** Ask for a new organisation: the dogo team validates it before it becomes visible. */
export default function NewOrganizationScreen() {
  const router = useGuardedRouter();
  const create = useCreateOrganization();

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.organization.createTitle }} />
      <OrganizationForm
        initial={{ name: '', description: '', city: '' }}
        explanation={t.organization.createExplanation}
        submitLabel={t.organization.createSubmit}
        onSubmit={async (values) => {
          const organization = await create.mutateAsync({
            name: values.name,
            ...(values.description ? { description: values.description } : {}),
            ...(values.city ? { city: values.city } : {}),
          });
          router.replace({ pathname: '/organizations/[id]', params: { id: organization.id } });
        }}
      />
    </Screen>
  );
}
