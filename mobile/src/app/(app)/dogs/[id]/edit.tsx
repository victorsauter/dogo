import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { useDog, useUpdateDog, useUploadDogPhoto } from '@/api/dogs';
import { errorMessage } from '@/api/errors';
import type { PickedPhoto } from '@/api/photoUpload';
import { DogForm, ErrorState, LoadingState, Screen } from '@/components';
import { useSession } from '@/auth';
import { dogFormFrom, toUpdateDogRequest } from '@/lib/forms';
import { t } from '@/strings';

export default function EditDogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const router = useRouter();
  const dog = useDog(id);
  const updateDog = useUpdateDog(id);
  const uploadPhoto = useUploadDogPhoto();

  /**
   * The dog is already saved when the photo fails: never leave the person on
   * a form whose error suggests nothing was saved. Offer to resend or to leave.
   */
  async function sendPhoto(photo: PickedPhoto) {
    try {
      await uploadPhoto.mutateAsync({ id, photo });
      router.back();
    } catch (error) {
      Alert.alert(t.dog.updatedPhotoFailed, errorMessage(error), [
        { text: t.dog.photoLater, style: 'cancel', onPress: () => router.back() },
        { text: t.dog.photoRetry, onPress: () => void sendPhoto(photo) },
      ]);
    }
  }

  if (dog.isPending)
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  if (dog.isError || dog.data.ownerId !== user?.id) {
    return (
      <Screen scroll={false}>
        <ErrorState
          error={dog.error}
          message={dog.isError ? undefined : t.errors['dog.forbidden']}
          onRetry={dog.isError ? () => dog.refetch() : undefined}
        />
      </Screen>
    );
  }
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.dog.editTitle }} />
      <DogForm
        key={dog.data.id}
        initial={dogFormFrom(dog.data)}
        photoUrl={dog.data.photoUrl}
        submitLabel={t.common.save}
        onSubmit={async (values, photo) => {
          await updateDog.mutateAsync(toUpdateDogRequest(values));
          if (photo) await sendPhoto(photo);
          else router.back();
        }}
      />
    </Screen>
  );
}
