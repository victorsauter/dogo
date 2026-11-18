import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { errorMessage } from '@/api/errors';
import type { PickedPhoto } from '@/api/photoUpload';
import { useUpdateProfile, useUploadMyPhoto } from '@/api/profile';
import { useSession } from '@/auth';
import { Button, PhotoPicker, Screen, Text, TextField } from '@/components';
import {
  limits,
  profileFields,
  serverFieldErrors,
  validateProfile,
  type FieldErrors,
  type ProfileFormValues,
} from '@/lib/forms';
import { t } from '@/strings';

/** Edit my profile; `?welcome=1` adds the first-run sentence (new member). */
export default function EditProfileScreen() {
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const { user } = useSession();
  const router = useRouter();
  const update = useUpdateProfile();
  const uploadPhoto = useUploadMyPhoto();
  const [values, setValues] = useState<ProfileFormValues>({
    // The API default name is a placeholder: start from an empty field instead.
    displayName: welcome ? '' : (user?.displayName ?? ''),
    bio: user?.bio ?? '',
  });
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [errors, setErrors] = useState<FieldErrors<keyof ProfileFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>();
  const saving = update.isPending || uploadPhoto.isPending;

  async function save() {
    const found = validateProfile(values);
    setErrors(found);
    setFormError(null);
    setPhotoError(undefined);
    if (Object.keys(found).length > 0) return;

    try {
      await update.mutateAsync({ displayName: values.displayName.trim(), bio: values.bio.trim() });
    } catch (error) {
      setErrors(serverFieldErrors(error, profileFields));
      setFormError(errorMessage(error));
      return;
    }
    if (photo) {
      try {
        await uploadPhoto.mutateAsync(photo);
      } catch (error) {
        setPhotoError(errorMessage(error));
        setFormError(t.profile.photoSaveFailed);
        return;
      }
    }
    router.back();
  }

  const name = values.displayName || user?.displayName || '';
  return (
    <Screen>
      <Stack.Screen options={{ title: t.profile.editTitle }} />
      {welcome ? <Text color="textMuted">{t.profile.welcome}</Text> : null}
      <PhotoPicker
        name={name}
        photoUrl={user?.photoUrl}
        picked={photo}
        onPick={(picked) => {
          setPhoto(picked);
          setPhotoError(undefined);
        }}
        error={photoError}
        disabled={saving}
      />
      <TextField
        label={t.profile.displayName}
        value={values.displayName}
        onChangeText={(text) => {
          setValues((current) => ({ ...current, displayName: text }));
          setErrors((current) => ({ ...current, displayName: undefined }));
        }}
        error={errors.displayName}
        maxLength={limits.displayName}
        autoCapitalize="words"
      />
      <TextField
        label={t.profile.bio}
        value={values.bio}
        onChangeText={(text) => {
          setValues((current) => ({ ...current, bio: text }));
          setErrors((current) => ({ ...current, bio: undefined }));
        }}
        error={errors.bio}
        hint={t.profile.bioHint}
        maxLength={limits.bio}
        multiline
      />
      {formError ? (
        <Text color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Button label={t.common.save} loading={saving} onPress={save} />
      {welcome ? (
        <Button label={t.profile.later} variant="secondary" onPress={() => router.back()} />
      ) : null}
    </Screen>
  );
}
