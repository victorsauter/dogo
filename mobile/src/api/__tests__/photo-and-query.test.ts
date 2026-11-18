import { ApiError } from '../errors';
import { photoUri } from '../photo';
import { shouldRetry } from '../queryClient';

describe('photoUri', () => {
  it('prefixes relative paths with the API URL', () => {
    expect(photoUri('/photos/a.jpg', 'http://api.test')).toBe('http://api.test/photos/a.jpg');
    expect(photoUri('photos/a.jpg', 'http://api.test')).toBe('http://api.test/photos/a.jpg');
  });

  it('keeps absolute URLs and ignores missing photos', () => {
    expect(photoUri('https://cdn.test/a.jpg', 'http://api.test')).toBe('https://cdn.test/a.jpg');
    expect(photoUri(null)).toBeUndefined();
    expect(photoUri('')).toBeUndefined();
  });
});

describe('shouldRetry', () => {
  it('never retries 4xx responses', () => {
    expect(shouldRetry(0, new ApiError({ kind: 'http', status: 409 }))).toBe(false);
  });

  it('never retries app-side failures', () => {
    expect(shouldRetry(0, new ApiError({ kind: 'client' }))).toBe(false);
  });

  it('retries network and server failures twice', () => {
    const network = new ApiError({ kind: 'network' });
    const server = new ApiError({ kind: 'http', status: 503 });
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, server)).toBe(true);
    expect(shouldRetry(2, network)).toBe(false);
  });

  it('retries a timed-out request once, and never a 429', () => {
    const timedOut = new ApiError({ kind: 'network', timedOut: true });
    expect(shouldRetry(0, timedOut)).toBe(true);
    expect(shouldRetry(1, timedOut)).toBe(false);
    expect(shouldRetry(0, new ApiError({ kind: 'http', status: 429 }))).toBe(false);
  });
});
