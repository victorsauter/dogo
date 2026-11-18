import { router } from 'expo-router';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { sessionStore } from '@/auth/sessionStore';
import { t } from '@/strings';
import { authResponse, testUser, walkDetail } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

const APP_DIR = './src/app';
const walk = walkDetail({
  id: 'a1a1a1a1-0000-4000-8000-000000000001',
  title: 'Balade du soir',
  isOrganizer: true,
  organizer: { id: testUser.id, displayName: testUser.displayName, photoUrl: null },
});
const path = `/api/v1/walks/${walk.id}`;

afterEach(async () => {
  await act(() => sessionStore.clear());
});

/** Presses « Enregistrer » without waiting for the save, which the test holds on the network. */
async function pressSave() {
  // `fireEvent.press` would wait for the handler's promise, held on purpose.
  let node: ReturnType<typeof screen.getByRole> | null = screen.getByRole('button', {
    name: t.common.save,
  });
  while (node && !node.props.onClick) node = node.parent;
  const onPress = node!.props.onClick as (event: unknown) => void;
  await act(async () => {
    onPress({ nativeEvent: {}, stopPropagation() {}, preventDefault() {} });
  });
}

/** The stack is « Balades » > the walk > its edit form, with the save held on the network. */
async function openEditWithSaveHeld() {
  let release: (response: Response) => void = () => {};
  mockApi({
    [`GET ${path}`]: () => ok(walk),
    [`PATCH ${path}`]: () => new Promise<Response>((resolve) => (release = resolve)),
    'GET /api/v1/me/dogs': () => ok([]),
  });
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: '/' });
  await screen.findByLabelText(t.discover.mapLabel);
  await act(() => router.push(`/walks/${walk.id}`));
  await screen.findByText(walk.title);
  await act(() => router.push(`/walks/${walk.id}/edit`));
  await screen.findByDisplayValue(walk.title);
  return { release: (response: Response) => release(response) };
}

describe('going back while a save is running', () => {
  it('does not pop a second screen when the save ends after the person left', async () => {
    const { release } = await openEditWithSaveHeld();

    await pressSave();
    await act(() => router.back());
    expect(screen).toHavePathname(`/walks/${walk.id}`);

    await act(async () => release(ok(walk)));
    // The walk is saved; the person stays where they went back to, not one screen further.
    await waitFor(() => expect(screen).toHavePathname(`/walks/${walk.id}`));
    expect(screen.getByText(walk.title)).toBeTruthy();
  });

  it('still goes back when the person stayed on the form', async () => {
    const { release } = await openEditWithSaveHeld();

    await pressSave();
    await act(async () => release(ok(walk)));

    await waitFor(() => expect(screen).toHavePathname(`/walks/${walk.id}`));
  });
});
