import { PILOT_CENTER, readConfig } from '../config';

describe('readConfig', () => {
  it('defaults to the local API, no test sign-in and a map centred on Seppois-le-Haut', () => {
    expect(readConfig({})).toEqual({
      apiUrl: 'http://localhost:5080',
      devLogin: false,
      defaultCenter: { latitude: 47.5339, longitude: 7.1844 },
    });
    expect(PILOT_CENTER).toEqual({ latitude: 47.5339, longitude: 7.1844 });
  });

  it('reads another default centre from the environment', () => {
    expect(
      readConfig({
        EXPO_PUBLIC_DEFAULT_LATITUDE: ' 48.5734 ',
        EXPO_PUBLIC_DEFAULT_LONGITUDE: '7.7521',
      }).defaultCenter,
    ).toEqual({ latitude: 48.5734, longitude: 7.7521 });
  });

  it.each([
    [undefined, '7.7521'],
    ['48.5734', undefined],
    ['', ''],
    ['nord', '7.7521'],
    ['91', '7.7521'],
    ['48.5734', '-181'],
  ])('keeps Seppois-le-Haut for an incomplete or invalid position (%p, %p)', (lat, lng) => {
    expect(
      readConfig({ EXPO_PUBLIC_DEFAULT_LATITUDE: lat, EXPO_PUBLIC_DEFAULT_LONGITUDE: lng })
        .defaultCenter,
    ).toEqual(PILOT_CENTER);
  });

  it('reads the variables and drops the trailing slash', () => {
    expect(
      readConfig({
        EXPO_PUBLIC_API_URL: 'https://api.example.test/',
        EXPO_PUBLIC_DEV_LOGIN: 'true',
      }),
    ).toMatchObject({ apiUrl: 'https://api.example.test', devLogin: true });
  });

  it('only enables the test sign-in for "true"', () => {
    expect(readConfig({ EXPO_PUBLIC_DEV_LOGIN: '1' }).devLogin).toBe(false);
    expect(readConfig({ EXPO_PUBLIC_DEV_LOGIN: 'TRUE' }).devLogin).toBe(true);
  });

  it('never enables the test sign-in outside a development build', () => {
    const release = readConfig(
      { EXPO_PUBLIC_API_URL: 'https://api.dogo.test', EXPO_PUBLIC_DEV_LOGIN: 'true' },
      false,
    );
    expect(release.devLogin).toBe(false);
  });

  it('accepts any API address in development, without error', () => {
    expect(readConfig({ EXPO_PUBLIC_API_URL: 'http://192.168.1.20:5080' }, true)).toMatchObject({
      apiUrl: 'http://192.168.1.20:5080',
    });
    expect(readConfig({}, true).error).toBeUndefined();
  });

  it('flags a distribution build without an API address instead of using localhost', () => {
    const release = readConfig({ EXPO_PUBLIC_API_URL: '  ' }, false);
    expect(release.error).toBe('missingApiUrl');
    expect(release.apiUrl).toBe('');
  });

  it.each(['http://api.dogo.test', 'api.dogo.test', 'https://', 'ftp://api.dogo.test'])(
    'flags a distribution build whose API address is not https (%p)',
    (url) => {
      expect(readConfig({ EXPO_PUBLIC_API_URL: url }, false).error).toBe('insecureApiUrl');
    },
  );

  it('accepts an https API address in a distribution build', () => {
    const release = readConfig({ EXPO_PUBLIC_API_URL: 'https://api.dogo.test/' }, false);
    expect(release.error).toBeUndefined();
    expect(release.apiUrl).toBe('https://api.dogo.test');
  });

  it('reads the Google client IDs and ignores blanks', () => {
    const config = readConfig({
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: ' web.apps.googleusercontent.com ',
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '  ',
    });
    expect(config.googleWebClientId).toBe('web.apps.googleusercontent.com');
    expect(config.googleIosClientId).toBeUndefined();
  });
});
