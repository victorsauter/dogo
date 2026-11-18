import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { loadDemoDataSection } from '@/devtools';
import type { DemoAccount, DemoDataStatus } from '@/devtools/demoData';
import { matchesDemoAccount } from '@/devtools/demoData';
import { config } from '@/lib/config';
import { format, t } from '@/strings';
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

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const APP_DIR = './src/app';
const URL = '/api/v1/dev/demo-data';
const mutableConfig = config as { devLogin: boolean };

const accounts: DemoAccount[] = [
  {
    subject: 'demo-leonie-muller',
    displayName: 'Léonie Muller',
    photoUrl: '/photos/leonie.png',
    kind: 'Owner',
    dogNames: ['Gribouille', 'Nala'],
    organizationName: null,
  },
  {
    subject: 'demo-marie-schmitt',
    displayName: 'Marie Schmitt',
    photoUrl: null,
    kind: 'Owner',
    dogNames: ['Filou', 'Praline'],
    organizationName: null,
  },
  {
    subject: 'demo-sandrine-gutzwiller',
    displayName: 'Sandrine Gutzwiller',
    photoUrl: null,
    kind: 'Educator',
    dogNames: ['Java'],
    organizationName: 'Club canin du Sundgau',
  },
  {
    subject: 'demo-hugo-lefebvre',
    displayName: 'Hugo Lefebvre',
    photoUrl: null,
    kind: 'Educator',
    dogNames: [],
    organizationName: 'Les Pattes de l’Ill',
  },
];

const counts = {
  owners: 50,
  educators: 10,
  dogs: 95,
  organizations: 5,
  walks: 45,
  upcomingWalks: 25,
  pastWalks: 20,
  registrations: 257,
  messages: 114,
  blocks: 3,
  reports: 4,
  photos: 77,
};

const empty: DemoDataStatus = {
  exists: false,
  counts: Object.fromEntries(Object.keys(counts).map((key) => [key, 0])) as typeof counts,
  accounts: [],
};
const present: DemoDataStatus = { exists: true, counts, accounts };

const presentText = format(t.demoData.present, {
  owners: 50,
  educators: 10,
  dogs: 95,
  walks: 45,
  upcoming: 25,
  messages: 114,
  photos: 77,
});

const demoCalls = (calls: MockRequest[]) => calls.filter((call) => call.path === URL);

beforeEach(() => {
  mutableConfig.devLogin = true;
});

afterEach(async () => {
  jest.restoreAllMocks();
  await act(() => sessionStore.clear());
});

describe('demo data card', () => {
  it('says there is no demo data, then generates it with photos and shows a summary', async () => {
    let status = empty;
    const { calls } = mockApi({
      [`GET ${URL}`]: () => ok(status),
      [`POST ${URL}`]: () => {
        status = present;
        return ok({ counts, photosRequested: true, photosStored: 76, photosFailed: 1 });
      },
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    expect(await screen.findByText(t.demoData.none)).toBeTruthy();
    expect(screen.queryByText(t.demoData.signInAs)).toBeNull();
    expect(screen.queryByRole('button', { name: t.demoData.delete })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: t.demoData.generate }));

    expect(
      await screen.findByText(
        `${format(t.demoData.generated, { accounts: 60, walks: 45, photos: 76 })} 1 photo n’a pas pu être téléchargée.`,
      ),
    ).toBeTruthy();
    expect(await screen.findByText(presentText)).toBeTruthy();
    expect(screen.getByText(t.demoData.signInAs)).toBeTruthy();
    expect(demoCalls(calls).find((call) => call.method === 'POST')?.json).toEqual({ photos: true });
  });

  it('shows the progress while generating, without photos when the switch is off', async () => {
    let finish: (response: Response) => void = () => {};
    const { calls } = mockApi({
      [`GET ${URL}`]: () => ok(empty),
      [`POST ${URL}`]: () => new Promise<Response>((resolve) => (finish = resolve)),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    await fireEvent(await screen.findByLabelText(t.demoData.photos), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: t.demoData.generate }));

    expect(await screen.findByText(t.demoData.generating)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.demoData.generate })).toBeDisabled();
    expect(screen.getByRole('button', { name: t.auth.devLoginButton })).toBeEnabled();
    expect(demoCalls(calls).find((call) => call.method === 'POST')?.json).toEqual({
      photos: false,
    });

    await act(async () =>
      finish(ok({ counts, photosRequested: false, photosStored: 0, photosFailed: 0 })),
    );
    expect(
      await screen.findByText(format(t.demoData.generated, { accounts: 60, walks: 45, photos: 0 })),
    ).toBeTruthy();
    expect(screen.queryByText(t.demoData.generating)).toBeNull();
  });

  it('shows the counts and deletes the demo data after a confirmation', async () => {
    let status = present;
    const { calls } = mockApi({
      [`GET ${URL}`]: () => ok(status),
      [`DELETE ${URL}`]: () => {
        status = empty;
        return new Response(null, { status: 204 });
      },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    expect(await screen.findByText(presentText)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.demoData.delete }));

    expect(alert).toHaveBeenCalledWith(
      t.demoData.deleteConfirmTitle,
      t.demoData.deleteConfirmMessage,
      expect.any(Array),
    );
    expect(demoCalls(calls).filter((call) => call.method === 'DELETE')).toHaveLength(0);
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((button) => button.text === t.common.delete)!.onPress!());

    expect(await screen.findByText(t.demoData.deleted)).toBeTruthy();
    expect(await screen.findByText(t.demoData.none)).toBeTruthy();
    expect(demoCalls(calls).filter((call) => call.method === 'DELETE')).toHaveLength(1);
    expect(screen.queryByText(t.demoData.signInAs)).toBeNull();
  });

  it('explains in one sentence that demo data is disabled when the API answers 404', async () => {
    mockApi({ [`GET ${URL}`]: () => problemResponse(404, 'not_found') });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    expect(await screen.findByText(t.demoData.disabled)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.demoData.generate })).toBeNull();
    expect(screen.queryByText(t.errors.notFound)).toBeNull();
    // The test sign-in still works.
    expect(screen.getByText(t.auth.devLoginSection)).toBeTruthy();
  });

  it('offers to retry when the API cannot be reached', async () => {
    let fail = true;
    mockApi({
      [`GET ${URL}`]: () => (fail ? problemResponse(500) : ok(empty)),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    expect(await screen.findByText(t.errors.server)).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: t.common.retry }));
    expect(await screen.findByText(t.demoData.none)).toBeTruthy();
  });
});

describe('« Se connecter comme… »', () => {
  it('lists the demo accounts with their dogs and the educator badge, and filters them', async () => {
    mockApi({ [`GET ${URL}`]: () => ok(present) });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    expect(await screen.findByText(t.demoData.signInAs)).toBeTruthy();
    expect(screen.getByText('4 comptes de démonstration')).toBeTruthy();
    expect(screen.getByText('Gribouille, Nala')).toBeTruthy();
    expect(screen.getByText('Club canin du Sundgau')).toBeTruthy();
    expect(screen.getAllByText(t.demoData.educator)).toHaveLength(2);
    expect(screen.getByText(t.demoData.noDog)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t.demoData.search), 'club');
    expect(
      screen.getByRole('button', {
        name: format(t.demoData.signInAsA11y, { name: 'Sandrine Gutzwiller' }),
      }),
    ).toBeTruthy();
    expect(screen.queryByText('Marie Schmitt')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText(t.demoData.search), 'leonie');
    expect(screen.getByText('Léonie Muller')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t.demoData.search), 'personne');
    expect(screen.getByText(t.demoData.noMatch)).toBeTruthy();
  });

  it('signs in as the account through the dev sign-in', async () => {
    const { calls } = mockApi({
      [`GET ${URL}`]: () => ok(present),
      'POST /api/v1/auth/dev': () =>
        ok(authResponse({ user: { displayName: 'Sandrine Gutzwiller' } })),
      'GET /api/v1/me/dogs': () => ok([]),
      'GET /api/v1/me': () => ok(authResponse().user),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    await fireEvent.press(
      await screen.findByRole('button', {
        name: format(t.demoData.signInAsA11y, { name: 'Sandrine Gutzwiller' }),
      }),
    );

    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    expect(calls.find((call) => call.path === '/api/v1/auth/dev')?.json).toEqual({
      subject: 'demo-sandrine-gutzwiller',
      displayName: 'Sandrine Gutzwiller',
    });
    expect(sessionStore.getSession()?.accessToken).toMatch(/^access-/);
  });
});

describe('without the test sign-in', () => {
  it('renders nothing of the demo data and never calls its routes', async () => {
    mutableConfig.devLogin = false;
    const { calls } = mockApi({ [`GET ${URL}`]: () => ok(present) });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    expect(await screen.findByText(t.auth.noMethodTitle)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(t.demoData.title)).toBeNull());
    expect(screen.queryByText(t.demoData.signInAs)).toBeNull();
    expect(demoCalls(calls)).toHaveLength(0);
  });

  it('does not even load the demo data module', () => {
    mutableConfig.devLogin = false;
    expect(loadDemoDataSection()).toBeNull();
    mutableConfig.devLogin = true;
    expect(loadDemoDataSection()).toEqual(expect.any(Function));
  });
});

describe('matchesDemoAccount', () => {
  it('matches the name, dogs and organisation, ignoring case and accents', () => {
    const [leonie, , sandrine] = accounts;
    expect(matchesDemoAccount(leonie!, 'LÉONIE')).toBe(true);
    expect(matchesDemoAccount(leonie!, 'nala')).toBe(true);
    expect(matchesDemoAccount(sandrine!, 'sundgau java')).toBe(true);
    expect(matchesDemoAccount(sandrine!, 'sundgau nala')).toBe(false);
    expect(matchesDemoAccount(sandrine!, '  ')).toBe(true);
  });
});
