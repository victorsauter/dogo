import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { setSignInNotice, useSignInNotice } from '@/lib/signInNotice';
import { t } from '@/strings';
import { authResponse } from '@/test/fixtures';

import { SessionProvider, useSession } from '../SessionProvider';
import { createSessionStore, type SecureStorage } from '../sessionStore';

function NoticeProbe() {
  return <Text testID="notice">{useSignInNotice() ?? '-'}</Text>;
}

describe('SessionProvider: end of session', () => {
  afterEach(() => setSignInNotice(null));

  it.each([
    ['expired', t.auth.sessionExpired],
    ['suspended', t.auth.accountSuspended],
  ] as const)(
    'explains an imposed end of session (%s) on the sign-in screen',
    async (reason, message) => {
      const store = createSessionStore();
      await store.set(authResponse());
      await render(
        <SessionProvider store={store}>
          <Probe />
          <NoticeProbe />
        </SessionProvider>,
      );
      expect(screen.getByTestId('notice')).toHaveTextContent('-');

      await act(() => store.clear(reason));

      expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
      expect(screen.getByTestId('notice')).toHaveTextContent(message);
    },
  );

  it('shows no notice after a sign-out the person asked for', async () => {
    const store = createSessionStore();
    await store.set(authResponse());
    await render(
      <SessionProvider store={store} revoke={async () => {}}>
        <Probe />
        <NoticeProbe />
      </SessionProvider>,
    );

    await fireEvent.press(screen.getByTestId('sign-out'));

    expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
    expect(screen.getByTestId('notice')).toHaveTextContent('-');
  });

  it('revokes the token and signs out even when the device storage fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const failing: SecureStorage = {
      getItemAsync: async () => null,
      setItemAsync: async () => {},
      deleteItemAsync: async () => {
        throw new Error('Keychain unavailable');
      },
    };
    const store = createSessionStore(failing);
    await store.set(authResponse());
    const { refreshToken } = store.getSession()!;
    const revoke = jest.fn(async () => {});
    await render(
      <SessionProvider store={store} revoke={revoke}>
        <Probe />
      </SessionProvider>,
    );

    await fireEvent.press(screen.getByTestId('sign-out'));

    expect(revoke).toHaveBeenCalledWith(refreshToken);
    expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
  });
});

function Probe() {
  const { status, user, setSession, signOut } = useSession();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="user">{user?.displayName ?? '-'}</Text>
      <Pressable testID="sign-in" onPress={() => setSession(authResponse())} />
      <Pressable testID="sign-out" onPress={() => signOut()} />
    </>
  );
}

describe('SessionProvider', () => {
  it('loads the stored session, signs in and signs out', async () => {
    const store = createSessionStore();
    const revoke = jest.fn(async () => {});
    const onSignedOut = jest.fn();
    await render(
      <SessionProvider store={store} revoke={revoke} onSignedOut={onSignedOut}>
        <Probe />
      </SessionProvider>,
    );

    expect(await screen.findByText('signedOut')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sign-in'));
    expect(screen.getByTestId('status')).toHaveTextContent('signedIn');
    expect(screen.getByTestId('user')).toHaveTextContent('Léa Martin');
    const { refreshToken } = store.getSession()!;

    await fireEvent.press(screen.getByTestId('sign-out'));
    expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
    expect(screen.getByTestId('user')).toHaveTextContent('-');
    expect(revoke).toHaveBeenCalledWith(refreshToken);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('reports a session ended outside React (rejected refresh)', async () => {
    const store = createSessionStore();
    await store.set(authResponse());
    const onSignedOut = jest.fn();
    await render(
      <SessionProvider store={store} onSignedOut={onSignedOut}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('signedIn');

    await act(() => store.clear());
    expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow('useSession must be used inside');
  });
});
