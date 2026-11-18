import { config } from '@/lib/config';

/**
 * Turns a `photoUrl` from the API (relative path such as `/photos/abc.jpg`)
 * into an absolute URI for `<Image>`. Returns `undefined` when there is no photo.
 */
export function photoUri(
  photoUrl: string | null | undefined,
  apiUrl: string = config.apiUrl,
): string | undefined {
  if (!photoUrl) return undefined;
  // Absolute or local URIs (a photo just picked on the device) are used as they are.
  if (/^(https?|file|content|data|blob):/i.test(photoUrl)) return photoUrl;
  return `${apiUrl}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
}
