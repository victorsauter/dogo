import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { pickPhoto } from '@/lib/photoPicker';
import { t } from '@/strings';
import { authResponse, testDog, testUser } from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

jest.mock('@/lib/photoPicker', () => ({
  pickPhoto: jest.fn(),
  CameraPermissionError: class CameraPermissionError extends Error {},
}));

// Native date picker replaced by a button that picks 5 March 2021.
jest.mock('@react-native-community/datetimepicker', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable: P, Text: T } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (e: unknown, d: Date) => void }) =>
      React.createElement(
        P,
        {
          accessibilityRole: 'button',
          onPress: () => onChange({ type: 'set' }, new Date(2021, 2, 5)),
        },
        React.createElement(T, null, 'Date du test'),
      ),
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

const APP_DIR = './src/app';
const dogPath = `/api/v1/dogs/${testDog.id}`;

afterEach(async () => {
  await act(() => sessionStore.clear());
});

async function signIn() {
  await sessionStore.set(authResponse());
}

describe('dog detail', () => {
  it('shows every field in French with the age, and edit/delete for my dog', async () => {
    mockApi({ [`GET ${dogPath}`]: () => ok({ ...testDog, birthDate: '2000-01-01' }) });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/dogs/${testDog.id}` });

    expect(await screen.findByText('Biscotte')).toBeTruthy();
    expect(screen.getByText('Border collie')).toBeTruthy();
    expect(screen.getByText('Moyen')).toBeTruthy();
    expect(screen.getByText('À l’aise')).toBeTruthy();
    expect(screen.getByText('Légère')).toBeTruthy();
    expect(screen.getByText('En longe')).toBeTruthy();
    expect(screen.getByText(/^\d+ ans$/)).toBeTruthy();
    expect(screen.getByText('Adore les balades en forêt.')).toBeTruthy();
    expect(screen.getByRole('button', { name: t.common.edit })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.common.delete })).toBeTruthy();
  });

  it('is read-only for someone else’s dog and links to the owner', async () => {
    const owner = '6f1d3c1e-0000-4000-8000-0000000000aa';
    mockApi({
      [`GET ${dogPath}`]: () => ok({ ...testDog, ownerId: owner, birthDate: null, breed: null }),
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/dogs/${testDog.id}` });

    expect(await screen.findByText(t.dog.noBreed)).toBeTruthy();
    expect(screen.getByText(t.dog.noBirthDate)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.common.edit })).toBeNull();
    expect(screen.queryByRole('button', { name: t.common.delete })).toBeNull();
    expect(screen.getByRole('button', { name: t.dog.ownedBy })).toBeTruthy();
  });

  it('shows a French error for an unknown dog', async () => {
    mockApi({ [`GET ${dogPath}`]: () => problemResponse(404, 'dog.not_found') });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/dogs/${testDog.id}` });
    expect(await screen.findByText(t.errors['dog.not_found'])).toBeTruthy();
  });
});

describe('delete a dog', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  /** Presses the destructive button of the last confirmation. */
  async function confirm() {
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === t.common.delete)!.onPress!());
  }

  it('confirms with a message about the cancelled registrations, then deletes', async () => {
    let dogs = [testDog];
    const { calls } = mockApi({
      [`GET ${dogPath}`]: () => ok(testDog),
      [`DELETE ${dogPath}`]: () => {
        dogs = [];
        return new Response(null, { status: 204 });
      },
      'GET /api/v1/me': () => ok(testUser),
      'GET /api/v1/me/dogs': () => ok(dogs),
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/profile' });
    await fireEvent.press(await screen.findByText('Biscotte'));
    await fireEvent.press(await screen.findByRole('button', { name: t.common.delete }));

    expect(alert).toHaveBeenCalledWith(
      'Supprimer Biscotte ?',
      expect.stringContaining('inscriptions à venir seront annulées'),
      expect.any(Array),
    );
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await confirm();

    await waitFor(() => expect(screen).toHavePathname('/profile'));
    expect(await screen.findByText(t.dog.myDogsEmptyTitle)).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === dogPath)).toBe(true);
  });

  it('keeps the dog and shows the error when deletion fails', async () => {
    mockApi({
      [`GET ${dogPath}`]: () => ok(testDog),
      [`DELETE ${dogPath}`]: () => problemResponse(403, 'dog.forbidden'),
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/dogs/${testDog.id}` });
    await fireEvent.press(await screen.findByRole('button', { name: t.common.delete }));
    await confirm();
    expect(await screen.findByText(t.errors['dog.forbidden'])).toBeTruthy();
  });
});

describe('dog form', () => {
  const created = { ...testDog, id: 'new-dog-id', name: 'Nala', photoUrl: null };

  async function fillValid() {
    await fireEvent.changeText(screen.getByLabelText(t.dog.name), ' Nala ');
    await fireEvent.press(screen.getByRole('radio', { name: 'Petit' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Sélectif' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Aucune' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'En laisse' }));
  }

  it('validates required fields before sending anything', async () => {
    const { calls } = mockApi({});
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/dogs/new' });

    await fireEvent.press(await screen.findByRole('button', { name: t.dog.add }));

    expect(screen.getAllByText(t.common.required)).toHaveLength(5);
    expect(calls).toHaveLength(0);
  });

  it('creates the dog, then uploads its photo, then opens it', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({
      uri: 'file:///tmp/nala.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
    const { calls } = mockApi({
      'POST /api/v1/dogs': () => ok(created),
      'PUT /api/v1/dogs/new-dog-id/photo': () => ok({ ...created, photoUrl: '/photos/n.jpg' }),
      'GET /api/v1/dogs/new-dog-id': () => ok(created),
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/dogs/new' });
    await screen.findByLabelText(t.dog.name);

    await fillValid();
    await fireEvent.changeText(screen.getByLabelText(t.dog.breed), 'Husky');
    await fireEvent.press(screen.getByRole('button', { name: t.photo.fromLibrary }));
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(t.dog.birthDatePick) }));
    await fireEvent.press(await screen.findByText('Date du test'));
    await fireEvent.press(screen.getByRole('button', { name: t.dog.add }));

    expect(await screen.findByText('Nala')).toBeTruthy();
    expect(screen).toHavePathname('/dogs/new-dog-id');
    expect(calls.map((c) => `${c.method} ${c.path}`).slice(0, 2)).toEqual([
      'POST /api/v1/dogs',
      'PUT /api/v1/dogs/new-dog-id/photo',
    ]);
    expect((calls[1]!.form?.get('file') as File).name).toBe('photo.jpg');
    expect(calls[0]!.json).toEqual({
      name: 'Nala',
      size: 'Small',
      sociability: 'Selective',
      reactivity: 'None',
      leashHabit: 'OnLeash',
      birthDate: '2021-03-05',
      breed: 'Husky',
    });
  });

  it('shows server validation errors on the right field', async () => {
    mockApi({
      'POST /api/v1/dogs': () =>
        problemResponse(400, 'validation.failed', { errors: { name: ['bad'] } }),
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/dogs/new' });
    await screen.findByLabelText(t.dog.name);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: t.dog.add }));

    expect(await screen.findByText(t.common.fieldInvalid)).toBeTruthy();
    expect(screen.getByText(t.errors['validation.failed'])).toBeTruthy();
    expect(screen).toHavePathname('/dogs/new');
  });

  it('edits my dog: sends every field and refreshes the profile list', async () => {
    let current = testDog;
    const { calls } = mockApi({
      [`GET ${dogPath}`]: () => ok(current),
      [`PATCH ${dogPath}`]: (req) => {
        current = { ...current, ...(req.json as object) } as typeof testDog;
        return ok(current);
      },
      'GET /api/v1/me': () => ok(testUser),
      'GET /api/v1/me/dogs': () => ok([current]),
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/profile' });
    await fireEvent.press(await screen.findByText('Biscotte'));
    await fireEvent.press(await screen.findByRole('button', { name: t.common.edit }));

    const name = await screen.findByDisplayValue('Biscotte');
    await fireEvent.changeText(name, 'Biscotte II');
    await fireEvent.changeText(screen.getByLabelText(t.dog.breed), '');
    await fireEvent.press(screen.getByRole('radio', { name: 'Grand' }));
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    expect(await screen.findByText('Biscotte II')).toBeTruthy();
    expect(calls.find((c) => c.method === 'PATCH')!.json).toMatchObject({
      name: 'Biscotte II',
      size: 'Large',
      breed: null,
      birthDate: '2022-03-15',
      description: 'Adore les balades en forêt.',
    });
  });

  it('shows a paw, not the initial of « Chien », while the new dog has no name (defect D3)', async () => {
    mockApi({});
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/dogs/new' });
    expect(await screen.findByLabelText(t.a11y.photo)).toBeTruthy();
    expect(screen.queryByText('C')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(t.dog.name), 'Nala');
    expect(screen.getByText('N')).toBeTruthy();
  });

  it('leaves no dead end when the dog is saved but its photo is not', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(pickPhoto).mockResolvedValue({
      uri: 'file:///tmp/new.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
    let uploads = 0;
    mockApi({
      [`GET ${dogPath}`]: () => ok(testDog),
      [`PATCH ${dogPath}`]: () => ok(testDog),
      [`PUT ${dogPath}/photo`]: () => {
        uploads += 1;
        return uploads === 1 ? problemResponse(413, 'photo.too_large') : ok(testDog);
      },
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/dogs/${testDog.id}/edit` });
    await screen.findByDisplayValue('Biscotte');
    await fireEvent.press(screen.getByRole('button', { name: t.photo.fromLibrary }));
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe(t.dog.updatedPhotoFailed);
    expect(message).toBe(t.errors['photo.too_large']);
    expect(buttons?.map((b) => b.text)).toEqual([t.dog.photoLater, t.dog.photoRetry]);
    await act(async () => buttons![1]!.onPress!());
    await waitFor(() => expect(uploads).toBe(2));
    alert.mockRestore();
  });

  it('refuses to edit a dog that is not mine', async () => {
    mockApi({ [`GET ${dogPath}`]: () => ok({ ...testDog, ownerId: 'someone-else' }) });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/dogs/${testDog.id}/edit` });
    expect(await screen.findByText(t.errors['dog.forbidden'])).toBeTruthy();
    expect(screen.queryByLabelText(t.dog.name)).toBeNull();
  });
});
