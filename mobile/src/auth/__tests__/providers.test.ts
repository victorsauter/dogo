/* eslint-disable @typescript-eslint/no-require-imports -- modules are loaded after jest.doMock */
/** Native sign-in modules must never break the app when they are missing (Expo Go). */
describe('sign-in providers without their native module', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-apple-authentication');
    jest.dontMock('@react-native-google-signin/google-signin');
  });

  it('imports without loading Apple or Google, and reports them unavailable', async () => {
    jest.doMock('expo-apple-authentication', () => {
      throw new Error('Cannot find native module ExpoAppleAuthentication');
    });
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error('TurboModule RNGoogleSignin not found');
    });
    jest.doMock('@/lib/config', () => ({
      config: { apiUrl: 'http://api.test', googleWebClientId: 'web', googleIosClientId: 'ios' },
    }));

    const apple = require('../providers/apple') as typeof import('../providers/apple');
    const google = require('../providers/google') as typeof import('../providers/google');

    await expect(apple.isAppleSignInAvailable()).resolves.toBe(false);
    expect(google.isGoogleConfigured()).toBe(true);
    expect(google.isGoogleSignInAvailable()).toBe(false);
    await expect(google.requestGoogleIdToken()).rejects.toThrow();
  });

  it('Google needs the web client ID, and the iOS one on iOS', () => {
    jest.doMock('@/lib/config', () => ({ config: { apiUrl: 'x', googleIosClientId: 'ios' } }));
    expect(
      (require('../providers/google') as typeof import('../providers/google')).isGoogleConfigured(),
    ).toBe(false);
    jest.resetModules();
    jest.doMock('@/lib/config', () => ({ config: { apiUrl: 'x', googleWebClientId: 'web' } }));
    // jest-expo runs as iOS by default.
    expect(
      (require('../providers/google') as typeof import('../providers/google')).isGoogleConfigured(),
    ).toBe(false);
  });
});
