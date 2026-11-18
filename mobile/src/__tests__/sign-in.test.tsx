import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { sessionStore } from '@/auth/sessionStore';
import { config } from '@/lib/config';
import { t } from '@/strings';
import { authResponse } from '@/test/fixtures';
import { mockApi, ok, problemResponse, type MockRequest } from '@/test/mockApi';

jest.mock('@/lib/config', () => ({
  config: {
    apiUrl: 'http://api.test',
    devLogin: true,
    googleWebClientId: undefined,
    googleIosClientId: undefined,
    defaultCenter: { latitude: 47.5339, longitude: 7.1844 },
  },
}));

const mockApple = {
  isAvailableAsync: jest.fn(async () => false),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
};
jest.mock('expo-apple-authentication', () => mockApple);

const mockGoogle = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
};
jest.mock('@react-native-google-signin/google-signin', () => mockGoogle);

const APP_DIR = './src/app';

/** The calls of the sign-in itself: without the demo data state the dev section asks for. */
const signInCalls = (calls: MockRequest[]) =>
  calls.filter((call) => call.path !== '/api/v1/dev/demo-data');
const mutableConfig = config as {
  devLogin: boolean;
  googleWebClientId?: string;
  googleIosClientId?: string;
};

beforeEach(() => {
  mutableConfig.devLogin = true;
  mutableConfig.googleWebClientId = undefined;
  mutableConfig.googleIosClientId = undefined;
  mockApple.isAvailableAsync.mockResolvedValue(false);
});

afterEach(async () => {
  await act(() => sessionStore.clear());
});

describe('sign-in: test account', () => {
  it('shows the prefilled test form and signs in', async () => {
    const { calls } = mockApi({
      'POST /api/v1/auth/dev': () => ok(authResponse({ user: { displayName: 'Camille Test' } })),
      'GET /api/v1/me/dogs': () => ok([]),
      'GET /api/v1/me': () => ok(authResponse().user),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    expect(await screen.findByText(t.auth.devLoginSection)).toBeTruthy();
    expect(screen.getByDisplayValue(t.auth.devDefaultIdentifier)).toBeTruthy();
    expect(screen.getByDisplayValue(t.auth.devDefaultDisplayName)).toBeTruthy();
    expect(screen.queryByText(t.auth.signInWithApple)).toBeNull();
    expect(screen.queryByText(t.auth.signInWithGoogle)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: t.auth.devLoginButton }));

    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    expect(signInCalls(calls)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/dev',
      json: { subject: t.auth.devDefaultIdentifier, displayName: t.auth.devDefaultDisplayName },
    });
    expect(sessionStore.getSession()?.accessToken).toMatch(/^access-/);
  });

  it('shows a French error and stays on the screen when the API refuses', async () => {
    mockApi({ 'POST /api/v1/auth/dev': () => problemResponse(404, 'not_found') });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    await fireEvent.press(await screen.findByRole('button', { name: t.auth.devLoginButton }));

    expect(await screen.findByText(t.errors.notFound)).toBeTruthy();
    expect(screen).toHavePathname('/sign-in');
    expect(sessionStore.getSession()).toBeNull();
  });

  it('disables the button when a field is empty', async () => {
    mockApi({});
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.changeText(await screen.findByDisplayValue(t.auth.devDefaultDisplayName), '');
    expect(screen.getByRole('button', { name: t.auth.devLoginButton })).toBeDisabled();
  });

  it('hides the test area when the test sign-in is off, and explains there is no method', async () => {
    mutableConfig.devLogin = false;
    mockApi({});
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    expect(await screen.findByText(t.auth.noMethodTitle)).toBeTruthy();
    expect(screen.queryByText(t.auth.devLoginSection)).toBeNull();
  });
});

describe('sign-in: Apple', () => {
  beforeEach(() => mockApple.isAvailableAsync.mockResolvedValue(true));

  it('sends the identity token and the name Apple gives on first sign-in', async () => {
    mockApple.signInAsync.mockResolvedValue({
      identityToken: 'apple-token',
      fullName: { givenName: 'Léa', familyName: 'Martin' },
    });
    const { calls } = mockApi({
      'POST /api/v1/auth/apple': () => ok(authResponse()),
      'GET /api/v1/me/dogs': () => ok([]),
      'GET /api/v1/me': () => ok(authResponse().user),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    await fireEvent.press(await screen.findByRole('button', { name: t.auth.signInWithApple }));

    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    expect(signInCalls(calls)[0]).toMatchObject({
      path: '/api/v1/auth/apple',
      json: { identityToken: 'apple-token', displayName: 'Léa Martin' },
    });
  });

  it('does nothing when the person cancels', async () => {
    mockApple.signInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    const { calls } = mockApi({});
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    await fireEvent.press(await screen.findByRole('button', { name: t.auth.signInWithApple }));

    await waitFor(() => expect(mockApple.signInAsync).toHaveBeenCalled());
    expect(signInCalls(calls)).toHaveLength(0);
    expect(screen.queryByText(t.auth.providerFailed)).toBeNull();
    expect(screen).toHavePathname('/sign-in');
  });

  it('shows a French error when Apple fails', async () => {
    mockApple.signInAsync.mockRejectedValue(new Error('boom'));
    mockApi({});
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.press(await screen.findByRole('button', { name: t.auth.signInWithApple }));
    expect(await screen.findByText(t.auth.providerFailed)).toBeTruthy();
  });

  it('shows the API error when the identity token is rejected', async () => {
    mockApple.signInAsync.mockResolvedValue({ identityToken: 'bad', fullName: null });
    mockApi({ 'POST /api/v1/auth/apple': () => problemResponse(401, 'auth.invalid_token') });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.press(await screen.findByRole('button', { name: t.auth.signInWithApple }));
    expect(await screen.findByText(t.errors['auth.invalid_token'])).toBeTruthy();
  });
});

describe('sign-in: Google', () => {
  beforeEach(() => {
    mutableConfig.googleWebClientId = 'web.apps.googleusercontent.com';
    mutableConfig.googleIosClientId = 'ios.apps.googleusercontent.com';
  });

  it('sends the ID token', async () => {
    mockGoogle.GoogleSignin.signIn.mockResolvedValue({
      type: 'success',
      data: { idToken: 'google-token' },
    });
    const { calls } = mockApi({
      'POST /api/v1/auth/google': () => ok(authResponse()),
      'GET /api/v1/me/dogs': () => ok([]),
      'GET /api/v1/me': () => ok(authResponse().user),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    await fireEvent.press(await screen.findByRole('button', { name: t.auth.signInWithGoogle }));

    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    expect(signInCalls(calls)[0]).toMatchObject({
      path: '/api/v1/auth/google',
      json: { idToken: 'google-token' },
    });
    expect(mockGoogle.GoogleSignin.configure).toHaveBeenCalledWith({
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: 'ios.apps.googleusercontent.com',
    });
  });

  it('does nothing when the person cancels', async () => {
    mockGoogle.GoogleSignin.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    const { calls } = mockApi({});
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.press(await screen.findByRole('button', { name: t.auth.signInWithGoogle }));
    await waitFor(() => expect(mockGoogle.GoogleSignin.signIn).toHaveBeenCalled());
    expect(signInCalls(calls)).toHaveLength(0);
    expect(screen.queryByText(t.auth.providerFailed)).toBeNull();
  });

  it('hides the button when no client ID is configured', async () => {
    mutableConfig.googleWebClientId = undefined;
    mockApi({});
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    expect(await screen.findByText(t.auth.devLoginSection)).toBeTruthy();
    expect(screen.queryByText(t.auth.signInWithGoogle)).toBeNull();
  });
});
