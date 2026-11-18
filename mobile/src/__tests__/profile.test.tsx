import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { sessionStore } from '@/auth/sessionStore';
import { pickPhoto } from '@/lib/photoPicker';
import { resetWelcomeNudge } from '@/lib/welcomeNudge';
import { t } from '@/strings';
import { authResponse, testDog, testUser } from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

jest.mock('@/lib/photoPicker', () => ({
  pickPhoto: jest.fn(),
  CameraPermissionError: class CameraPermissionError extends Error {},
}));

const APP_DIR = './src/app';
const photo = { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

beforeEach(() => resetWelcomeNudge());
afterEach(async () => {
  await act(() => sessionStore.clear());
});

async function openProfile() {
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: '/profile' });
}

describe('profile tab', () => {
  it('shows my profile and my dogs as cards', async () => {
    mockApi({
      'GET /api/v1/me': () => ok({ ...testUser, bio: 'Marcheuse du dimanche' }),
      'GET /api/v1/me/dogs': () => ok([testDog]),
    });
    await openProfile();

    expect(await screen.findByText('Bonjour Léa Martin !')).toBeTruthy();
    expect(await screen.findByText('Biscotte')).toBeTruthy();
    expect(screen.getByText('Moyen · À l’aise')).toBeTruthy();
    expect(await screen.findByText('Marcheuse du dimanche')).toBeTruthy();
    expect(screen.getByRole('button', { name: t.dog.add })).toBeTruthy();
  });

  it('invites to add a first dog when there is none', async () => {
    mockApi({
      'GET /api/v1/me': () => ok(testUser),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await openProfile();
    expect(await screen.findByText(t.dog.myDogsEmptyTitle)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: t.dog.add }));
    expect(await screen.findByText(t.dog.name)).toBeTruthy();
    expect(screen).toHavePathname('/dogs/new');
  });

  it('shows a French error with a retry when dogs cannot be loaded', async () => {
    mockApi({
      'GET /api/v1/me': () => ok(testUser),
      'GET /api/v1/me/dogs': () => problemResponse(403, 'account.suspended'),
    });
    await openProfile();
    expect(await screen.findByText(t.errors['account.suspended'])).toBeTruthy();
    expect(screen.getByRole('button', { name: t.common.retry })).toBeTruthy();
  });

  it('opens a dog from its card', async () => {
    mockApi({
      'GET /api/v1/me': () => ok(testUser),
      'GET /api/v1/me/dogs': () => ok([testDog]),
      [`GET /api/v1/dogs/${testDog.id}`]: () => ok(testDog),
    });
    await openProfile();
    await fireEvent.press(await screen.findByText('Biscotte'));
    expect(await screen.findByText('Border collie')).toBeTruthy();
    expect(screen).toHavePathname(`/dogs/${testDog.id}`);
  });
});

describe('edit profile', () => {
  const routes = () => ({
    'GET /api/v1/me': () => ok(testUser),
    'GET /api/v1/me/dogs': () => ok([]),
  });

  it('saves the name and bio, and updates the session and the profile screen', async () => {
    const updated = { ...testUser, displayName: 'Léa M.', bio: 'Salut !' };
    const { calls } = mockApi({
      ...routes(),
      'PATCH /api/v1/me': () => ok(updated),
    });
    await openProfile();
    await fireEvent.press(await screen.findByRole('button', { name: t.profile.editButton }));

    const name = await screen.findByDisplayValue('Léa Martin');
    await fireEvent.changeText(name, '  Léa M.  ');
    await fireEvent.changeText(screen.getByLabelText(t.profile.bio), ' Salut ! ');
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    expect(await screen.findByText('Bonjour Léa M. !')).toBeTruthy();
    expect(screen).toHavePathname('/profile');
    expect(calls.find((c) => c.method === 'PATCH')?.json).toEqual({
      displayName: 'Léa M.',
      bio: 'Salut !',
    });
    expect(sessionStore.getSession()?.user.displayName).toBe('Léa M.');
  });

  it('requires a display name and sends nothing', async () => {
    const { calls } = mockApi(routes());
    await openProfile();
    await fireEvent.press(await screen.findByRole('button', { name: t.profile.editButton }));
    await fireEvent.changeText(await screen.findByDisplayValue('Léa Martin'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    expect(await screen.findByText(t.common.required)).toBeTruthy();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('shows the server validation error on the right field', async () => {
    mockApi({
      ...routes(),
      'PATCH /api/v1/me': () =>
        problemResponse(400, 'validation.failed', { errors: { displayName: ['invalid'] } }),
    });
    await openProfile();
    await fireEvent.press(await screen.findByRole('button', { name: t.profile.editButton }));
    await fireEvent.press(await screen.findByRole('button', { name: t.common.save }));

    expect(await screen.findByText(t.common.fieldInvalid)).toBeTruthy();
    expect(screen.getByText(t.errors['validation.failed'])).toBeTruthy();
  });

  it('uploads the chosen photo as multipart after saving the profile', async () => {
    jest.mocked(pickPhoto).mockResolvedValue(photo);
    const withPhoto = { ...testUser, photoUrl: '/photos/new.jpg' };
    const { calls } = mockApi({
      ...routes(),
      'PATCH /api/v1/me': () => ok(testUser),
      'PUT /api/v1/me/photo': () => ok(withPhoto),
    });
    await openProfile();
    await fireEvent.press(await screen.findByRole('button', { name: t.profile.editButton }));
    await fireEvent.press(await screen.findByRole('button', { name: t.photo.fromLibrary }));
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    await waitFor(() => expect(sessionStore.getSession()?.user.photoUrl).toBe('/photos/new.jpg'));
    const upload = calls.find((c) => c.method === 'PUT');
    expect(upload?.path).toBe('/api/v1/me/photo');
    expect(upload?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const file = upload?.form?.get('file') as File;
    expect(file).toBeInstanceOf(Blob);
    expect(file.name).toBe('photo.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(screen).toHavePathname('/profile');
  });

  it.each([
    ['photo.too_large', 413],
    ['photo.unsupported_type', 415],
  ])('explains the API photo error %s in French', async (code, status) => {
    jest.mocked(pickPhoto).mockResolvedValue(photo);
    mockApi({
      ...routes(),
      'PATCH /api/v1/me': () => ok(testUser),
      'PUT /api/v1/me/photo': () => problemResponse(status, code),
    });
    await openProfile();
    await fireEvent.press(await screen.findByRole('button', { name: t.profile.editButton }));
    await fireEvent.press(await screen.findByRole('button', { name: t.photo.fromLibrary }));
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    expect(await screen.findByText(t.errors[code as 'photo.too_large'])).toBeTruthy();
    expect(screen.getByText(t.profile.photoSaveFailed)).toBeTruthy();
    expect(screen).toHavePathname('/edit-profile');
  });
});

describe('first-run nudge', () => {
  const newMember = { displayName: 'Nouveau membre' };

  it('opens the edit-profile screen with a welcome sentence after sign-in', async () => {
    mockApi({
      'GET /api/v1/me': () => ok({ ...testUser, ...newMember }),
      'GET /api/v1/me/dogs': () => ok([]),
      'PATCH /api/v1/me': () => ok({ ...testUser, displayName: 'Léa' }),
    });
    await sessionStore.set(authResponse({ user: newMember }));
    await renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByText(t.profile.welcome)).toBeTruthy();
    expect(screen).toHavePathname('/edit-profile');
    expect(screen.queryByDisplayValue('Nouveau membre')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText(t.profile.displayName), 'Léa');
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    expect(await screen.findByText(t.discover.emptyTitle)).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(screen.queryByText(t.profile.welcome)).toBeNull();
  });

  it('does not open again once dismissed', async () => {
    mockApi({});
    await sessionStore.set(authResponse({ user: newMember }));
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByRole('button', { name: t.profile.later }));
    expect(await screen.findByText(t.discover.emptyTitle)).toBeTruthy();

    // A profile refresh must not reopen it.
    await act(() => sessionStore.updateUser({ ...testUser, ...newMember, bio: 'x' }));
    expect(screen).toHavePathname('/');
  });

  it('stays quiet for a member who already has a name', async () => {
    mockApi({});
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByText(t.discover.emptyTitle)).toBeTruthy();
    expect(screen).toHavePathname('/');
  });
});

describe('public profile', () => {
  const other = '6f1d3c1e-0000-4000-8000-0000000000aa';

  it('shows name, bio and dogs, read-only', async () => {
    mockApi({
      [`GET /api/v1/users/${other}`]: () =>
        ok({
          id: other,
          displayName: 'Paul Durand',
          bio: 'Petit chien, grandes balades',
          photoUrl: null,
          dogs: [{ ...testDog, ownerId: other, name: 'Pixel' }],
        }),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/users/${other}` });

    expect(await screen.findByText('Paul Durand')).toBeTruthy();
    expect(screen.getByText('Petit chien, grandes balades')).toBeTruthy();
    expect(screen.getByText('Les chiens de Paul Durand')).toBeTruthy();
    expect(screen.getByText('Pixel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.profile.editButton })).toBeNull();
  });

  it('shows a French message for an unknown user', async () => {
    mockApi({ [`GET /api/v1/users/${other}`]: () => problemResponse(404, 'user.not_found') });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/users/${other}` });
    expect(await screen.findByText(t.errors['user.not_found'])).toBeTruthy();
  });
});
