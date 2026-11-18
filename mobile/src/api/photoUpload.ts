import { File } from 'expo-file-system';

/** A photo ready to upload: a local file produced by `pickPhoto()`. */
export interface PickedPhoto {
  /** `file://` URI of the (resized, compressed) image. */
  uri: string;
  name: string;
  type: string;
}

/**
 * Multipart body of `PUT /me/photo` and `PUT /dogs/{id}/photo`: one `file` field.
 *
 * Expo SDK 58 replaces the global `fetch` with `expo/fetch`, which encodes
 * `FormData` itself and only accepts strings and `Blob`-like parts: React
 * Native's proprietary `{ uri, name, type }` part makes it throw before any
 * request is sent. The part is therefore an `expo-file-system` `File`, which
 * implements `Blob` (`type` from the extension, `name`, `bytes()`), as the Expo
 * documentation recommends for uploads with `expo/fetch`.
 *
 * Passed to openapi-fetch as `bodySerializer` (which then leaves the
 * `Content-Type` header, boundary included, to the network layer).
 */
export function photoForm(photo: PickedPhoto): FormData {
  const form = new FormData();
  form.append('file', new File(photo.uri) as unknown as Blob, photo.name);
  return form;
}
