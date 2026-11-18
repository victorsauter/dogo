import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import type { PickedPhoto } from '@/api/photoUpload';
import { openAppSettings } from '@/lib/linking';
import { CameraPermissionError, pickPhoto, type PhotoSource } from '@/lib/photoPicker';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import { Avatar } from './Avatar';
import type { IconName } from './Icon';
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
  /** Shown in the avatar while `name` is empty. */
  placeholderIcon?: IconName;
}

/** Avatar with « Photothèque » and « Appareil photo » buttons. Uploading is left to the form. */
export function PhotoPicker({
  name,
  photoUrl,
  picked,
  onPick,
  error,
  disabled,
  placeholderIcon,
}: PhotoPickerProps) {
  const { spacing } = useTheme();
  const [pickError, setPickError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);

  // Back from the system settings, where the camera may have been allowed: the
  // refusal no longer holds until the camera is tried again.
  useEffect(() => {
    if (!cameraDenied) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setCameraDenied(false);
      setPickError(null);
    });
    return () => subscription.remove();
  }, [cameraDenied]);

  async function choose(source: PhotoSource) {
    setPickError(null);
    setCameraDenied(false);
    try {
      const photo = await pickPhoto(source);
      if (photo) onPick(photo);
    } catch (e) {
      const denied = e instanceof CameraPermissionError;
      setCameraDenied(denied);
      setPickError(denied ? t.photo.cameraDenied : t.photo.pickFailed);
    }
  }

  const message = pickError ?? error;
  return (
    <View style={{ alignItems: 'center', gap: spacing.md }}>
      <Avatar
        name={name}
        photoUrl={picked?.uri ?? photoUrl}
        size={112}
        placeholderIcon={placeholderIcon}
      />
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
      {cameraDenied ? (
        <Button
          label={t.common.openSettings}
          variant="secondary"
          onPress={() => void openAppSettings()}
        />
      ) : null}
    </View>
  );
}
