/** A photo ready to upload: a local file produced by `pickPhoto()`. */
export interface PickedPhoto {
  /** `file://` URI of the (resized, compressed) image. */
  uri: string;
  name: string;
  type: string;
}

/**
 * Multipart body of `PUT /me/photo` and `PUT /dogs/{id}/photo`: one `file` field.
 * React Native's `FormData` reads a `{ uri, name, type }` object from disk.
 * Passed to openapi-fetch as `bodySerializer` (which then leaves the
 * `Content-Type` header to the network layer, boundary included).
 */
export function photoForm(photo: PickedPhoto): FormData {
  const form = new FormData();
  form.append('file', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  return form;
}
