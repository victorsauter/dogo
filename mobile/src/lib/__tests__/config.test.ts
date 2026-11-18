import { readConfig } from '../config';

describe('readConfig', () => {
  it('defaults to the local API and no test sign-in', () => {
    expect(readConfig({})).toEqual({ apiUrl: 'http://localhost:5080', devLogin: false });
  });

  it('reads the variables and drops the trailing slash', () => {
    expect(
      readConfig({
        EXPO_PUBLIC_API_URL: 'https://api.example.test/',
        EXPO_PUBLIC_DEV_LOGIN: 'true',
      }),
    ).toEqual({ apiUrl: 'https://api.example.test', devLogin: true });
  });

  it('only enables the test sign-in for "true"', () => {
    expect(readConfig({ EXPO_PUBLIC_DEV_LOGIN: '1' }).devLogin).toBe(false);
    expect(readConfig({ EXPO_PUBLIC_DEV_LOGIN: 'TRUE' }).devLogin).toBe(true);
  });
});
