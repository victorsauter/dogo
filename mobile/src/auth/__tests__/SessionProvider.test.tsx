import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { authResponse } from '@/test/fixtures';

import { SessionProvider, useSession } from '../SessionProvider';
import { createSessionStore } from '../sessionStore';

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
