import { useState } from 'react';
import { View } from 'react-native';

import type { PickedPhoto } from '@/api/photoUpload';
import { CameraPermissionError, pickPhoto, type PhotoSource } from '@/lib/photoPicker';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Text } from './Text';

export interface PhotoPickerProps {
  /** Name of the person or dog (initials and accessibility label). */
  name: string;
  /** Current photo from the API. */
  photoUrl?: string | null;
  /** Photo chosen in this form, not uploaded yet: shown instead of `photoUrl`. */
  picked: PickedPhoto | null;
  onPick: (photo: PickedPhoto) => void;
  /** Error from the upload (French), shown under the buttons. */
  error?: string;
  disabled?: boolean;
}

/** Avatar with « Photothèque » and « Appareil photo » buttons. Uploading is left to the form. */
export function PhotoPicker({ name, photoUrl, picked, onPick, error, disabled }: PhotoPickerProps) {
  const { spacing } = useTheme();
  const [pickError, setPickError] = useState<string | null>(null);

  async function choose(source: PhotoSource) {
    setPickError(null);
    try {
      const photo = await pickPhoto(source);
      if (photo) onPick(photo);
    } catch (e) {
      setPickError(e instanceof CameraPermissionError ? t.photo.cameraDenied : t.photo.pickFailed);
    }
  }

  const message = pickError ?? error;
  return (
    <View style={{ alignItems: 'center', gap: spacing.md }}>
      <Avatar name={name} photoUrl={picked?.uri ?? photoUrl} size={112} />
      <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
        <Button
          label={t.photo.fromLibrary}
          variant="secondary"
          disabled={disabled}
          onPress={() => choose('library')}
        />
        <Button
          label={t.photo.takePhoto}
          variant="secondary"
          disabled={disabled}
          onPress={() => choose('camera')}
        />
      </View>
      {message ? (
        <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </View>
  );
}
