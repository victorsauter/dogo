import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PickedPhoto } from '@/api/photoUpload';

export type PhotoSource = 'library' | 'camera';

/** Camera access was refused: show `t.photo.cameraDenied`. */
export class CameraPermissionError extends Error {
  constructor() {
    super('Camera permission denied');
    this.name = 'CameraPermissionError';
  }
}

/** Longest side of the uploaded image, in pixels (profile and dog photos are small). */
export const MAX_PHOTO_SIDE = 1280;
const JPEG_QUALITY = 0.8;

/**
 * Lets the person choose a photo from the library or take one, crops it to a
 * square, then resizes and re-encodes it as JPEG: well under the API's 5 MB
 * limit, and HEIC from iPhones becomes a format every client reads.
 * Resolves `null` when the person cancels.
 */
export async function pickPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new CameraPermissionError();
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_PHOTO_SIDE) {
    context.resize(
      asset.width >= asset.height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: JPEG_QUALITY,
  });
  return { uri: saved.uri, name: 'photo.jpg', type: 'image/jpeg' };
}
