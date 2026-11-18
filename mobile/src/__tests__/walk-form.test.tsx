import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { sessionStore } from '@/auth/sessionStore';
import { validateWalk, emptyWalkForm, toCreateWalkRequest } from '@/lib/forms';
import { t } from '@/strings';
import { authResponse, testUser, walkDetail } from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

const APP_DIR = './src/app';
const created = walkDetail({
  id: 'new-walk-id',
  title: 'Balade du soir',
  isOrganizer: true,
  organizer: { id: testUser.id, displayName: testUser.displayName, photoUrl: null },
});

afterEach(async () => {
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

async function openNewWalk() {
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: '/walks/new' });
  await screen.findByLabelText(t.walk.title);
}

describe('validateWalk', () => {
  const now = new Date('2026-11-18T08:00:00Z');
  const valid = {
    ...emptyWalkForm({ latitude: 48.85, longitude: 2.35 }, new Date('2026-11-19T09:00:00Z')),
    title: 'Tour du lac',
    locationLabel: 'Parvis',
  };

  it('accepts a complete walk', () => {
    expect(validateWalk(valid, now)).toEqual({});
  });

  it('mirrors the API limits', () => {
    const errors = validateWalk(
      {
        ...valid,
        title: 'ab',
        startsAt: new Date('2026-11-18T07:00:00Z'),
        locationLabel: ' ',
        maxDogs: 51,
        allowedSizes: [],
        description: 'x'.repeat(2001),
        rules: 'x'.repeat(1001),
        durationMinutes: 10,
      },
      now,
    );
    expect(errors).toEqual({
      title: 'Entre 3 et 80 caractères.',
      startsAt: t.walk.startsAtPast,
      locationLabel: t.common.required,
      maxDogs: 'Entre 1 et 50.',
      allowedSizes: t.walk.sizesRequired,
      description: 'Maximum 2000 caractères.',
      rules: 'Maximum 1000 caractères.',
      durationMinutes: t.common.fieldInvalid,
    });
  });

  it('builds the request with trimmed texts and sizes in order', () => {
    expect(
      toCreateWalkRequest({ ...valid, title: ' Tour ', allowedSizes: ['Large', 'Small'] }),
    ).toMatchObject({
      title: 'Tour',
      allowedSizes: ['Small', 'Large'],
      startsAt: '2026-11-19T09:00:00.000Z',
    });
  });
});

describe('create a walk', () => {
  it('validates before sending anything', async () => {
    const { calls } = mockApi({});
    await openNewWalk();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Petit' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Moyen' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grand' }));
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));

    expect(screen.getAllByText(t.common.required)).toHaveLength(2); // title, label
    expect(screen.getByText(t.walk.sizesRequired)).toBeTruthy();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('creates the walk, then opens its detail', async () => {
    const { calls } = mockApi({
      'POST /api/v1/walks': () => ok(created),
      'GET /api/v1/walks/new-walk-id': () => ok(created),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await openNewWalk();

    await fireEvent.changeText(screen.getByLabelText(t.walk.title), ' Balade du soir ');
    await fireEvent.changeText(screen.getByLabelText(t.walk.locationLabel), 'Fontaine');
    await fireEvent(screen.getByTestId('meeting-point-map'), 'press', {
      nativeEvent: { coordinate: { latitude: 48.87, longitude: 2.33 } },
    });
    await fireEvent.press(
      screen.getByRole('button', { name: `Augmenter ${t.walk.maxDogs.toLowerCase()}` }),
    );
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grand' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Sur approbation' }));
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));

    expect(await screen.findByText(t.walk.cancelWalk)).toBeTruthy();
    expect(screen).toHavePathname('/walks/new-walk-id');
    const body = calls.find((c) => c.method === 'POST')!.json;
    expect(body).toMatchObject({
      title: 'Balade du soir',
      location: { latitude: 48.87, longitude: 2.33 },
      locationLabel: 'Fontaine',
      maxDogs: 7,
      durationMinutes: 60,
      allowedSizes: ['Small', 'Medium'],
      leashRule: 'LeashRequired',
      access: 'Approval',
    });
    expect(new Date((body as { startsAt: string }).startsAt).getTime()).toBeGreaterThan(Date.now());
    expect(body).not.toHaveProperty('organizationId');
  });

  it('shows server field errors on the right fields', async () => {
    mockApi({
      'POST /api/v1/walks': () =>
        problemResponse(400, 'validation.failed', {
          errors: { Title: ['bad'], 'location.latitude': ['bad'] },
        }),
    });
    await openNewWalk();
    await fireEvent.changeText(screen.getByLabelText(t.walk.title), 'Balade');
    await fireEvent.changeText(screen.getByLabelText(t.walk.locationLabel), 'Fontaine');
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));

    expect(await screen.findAllByText(t.common.fieldInvalid)).toHaveLength(2);
    expect(screen.getByText(t.errors['validation.failed'])).toBeTruthy();
  });
});

describe('edit a walk', () => {
  const path = `/api/v1/walks/${created.id}`;

  async function openEdit(patch: () => Response) {
    const result = mockApi({ [`GET ${path}`]: () => ok(created), [`PATCH ${path}`]: patch });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${created.id}/edit` });
    await screen.findByDisplayValue(created.title);
    return result;
  }

  it('is prefilled and sends every field', async () => {
    const { calls } = await openEdit(() => ok(created));
    await fireEvent.changeText(screen.getByDisplayValue(created.title), 'Balade modifiée');
    await fireEvent.changeText(screen.getByDisplayValue(created.rules), '');
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.json).toMatchObject({
      title: 'Balade modifiée',
      rules: '',
      description: created.description,
      locationLabel: created.locationLabel,
      maxDogs: created.maxDogs,
      allowedSizes: created.allowedSizes,
    });
  });

  it.each(['walk.capacity_below_registered', 'walk.size_in_use'] as const)(
    'shows %s on its field',
    async (code) => {
      await openEdit(() => problemResponse(409, code));
      await fireEvent.press(screen.getByRole('button', { name: t.common.save }));
      // Once on the field, once as the form message.
      expect(await screen.findAllByText(t.errors[code])).toHaveLength(2);
    },
  );

  it('refuses to edit a walk I do not organise', async () => {
    mockApi({ [`GET ${path}`]: () => ok({ ...created, isOrganizer: false }) });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${created.id}/edit` });
    expect(await screen.findByText(t.walk.notOrganizer)).toBeTruthy();
  });
});
