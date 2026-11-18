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
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
  return `${apiUrl}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
}
