import { Stack, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { useCreateDog, useUploadDogPhoto } from '@/api/dogs';
import { errorMessage } from '@/api/errors';
import { DogForm, Screen } from '@/components';
import { emptyDogForm, toCreateDogRequest } from '@/lib/forms';
import { t } from '@/strings';

export default function NewDogScreen() {
  const router = useRouter();
  const createDog = useCreateDog();
  const uploadPhoto = useUploadDogPhoto();

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.dog.addTitle }} />
      <DogForm
        initial={emptyDogForm}
        submitLabel={t.dog.add}
        onSubmit={async (values, photo) => {
          const dog = await createDog.mutateAsync(toCreateDogRequest(values));
          if (photo) {
            try {
              await uploadPhoto.mutateAsync({ id: dog.id, photo });
            } catch (error) {
              // The dog exists: do not block the person, tell them what is missing.
              Alert.alert(t.dog.createdPhotoFailed, errorMessage(error));
            }
          }
          router.replace({ pathname: '/dogs/[id]', params: { id: dog.id } });
        }}
      />
    </Screen>
  );
}
