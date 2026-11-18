import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { FlatList } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { withDayHeaders } from '@/lib/thread';
import { t } from '@/strings';
import { authResponse, otherUser, testDog, testUser, walkDetail } from '@/test/fixtures';
import { jsonResponse, mockApi, ok, problemResponse } from '@/test/mockApi';

const APP_DIR = './src/app';
const walkId = 'a1a1a1a1-0000-4000-8000-000000000001';
const walkPath = `/api/v1/walks/${walkId}`;
const messagesPath = `${walkPath}/messages`;

const organizerWalk = (overrides = {}) =>
  walkDetail({
    isOrganizer: true,
    organizer: { id: testUser.id, displayName: testUser.displayName, photoUrl: null },
    ...overrides,
  });
const participantWalk = (overrides = {}) =>
  walkDetail({
    myRegistrations: [{ id: 'reg-1', dogId: testDog.id, status: 'Accepted' }],
    ...overrides,
  });

const at = (daysAgo: number, hour = 9, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

function message(id: string, text: string, createdAt: string, overrides = {}) {
  return {
    id,
    text,
    createdAt,
    author: { id: otherUser.id, displayName: otherUser.displayName, photoUrl: null },
    isMine: false,
    ...overrides,
  };
}

afterEach(async () => {
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

async function openThread() {
  await sessionStore.set(authResponse());
  return renderRouter(APP_DIR, { initialUrl: `/walks/${walkId}/messages` });
}

describe('thread rendering', () => {
  it('groups the messages by day and tells mine from the others', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(participantWalk()),
      [`GET ${messagesPath}`]: () =>
        ok({
          hasMore: false,
          items: [
            message('m1', 'Rendez-vous à 9 h', at(1, 18)),
            message('m2', 'Parfait !', at(0, 8), {
              isMine: true,
              author: { ...otherUser, id: testUser.id },
            }),
            message('m3', 'Je suis en route', at(0, 9)),
            message('m4', 'Ancien compte', at(0, 10), { author: null }),
          ],
        }),
    });
    await openThread();

    expect(await screen.findByText('Rendez-vous à 9 h')).toBeTruthy();
    expect(screen.getByText(t.dates.yesterday)).toBeTruthy();
    expect(screen.getByText(t.dates.today)).toBeTruthy();
    expect(screen.getAllByText(otherUser.displayName)).toHaveLength(2);
    expect(screen.getByText(t.thread.deletedAccount)).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(`^${t.thread.mine}, .*Parfait`))).toBeTruthy();
    expect(screen.queryByText(t.thread.loadOlder)).toBeNull();
  });

  it('opens the profile of an author, but not of a deleted account', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(participantWalk()),
      [`GET ${messagesPath}`]: () =>
        ok({
          hasMore: false,
          items: [
            message('m1', 'Salut', at(0, 8)),
            message('m2', 'Hello', at(0, 9), { author: null }),
          ],
        }),
      [`GET /api/v1/users/${otherUser.id}`]: () => ok({ ...otherUser, bio: '', dogs: [] }),
    });
    await openThread();
    await screen.findByText('Salut');

    expect(screen.queryByLabelText(`Voir le profil de ${t.thread.deletedAccount}`)).toBeNull();
    await fireEvent.press(
      screen.getAllByLabelText(`Voir le profil de ${otherUser.displayName}`)[0]!,
    );
    await waitFor(() => expect(screen).toHavePathname(`/users/${otherUser.id}`));
  });

  it('shows an empty state', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(organizerWalk()),
      [`GET ${messagesPath}`]: () => ok({ hasMore: false, items: [] }),
    });
    await openThread();
    expect(await screen.findByText(t.thread.emptyTitle)).toBeTruthy();
  });

  it('builds day headers in order', () => {
    const rows = withDayHeaders(
      [message('a', 'x', at(2)), message('b', 'y', at(2, 12)), message('c', 'z', at(0))],
      new Date(),
    );
    expect(rows.map((row) => row.kind)).toEqual(['day', 'message', 'message', 'day', 'message']);
  });
});

describe('staying on the newest message', () => {
  const farFromBottom = {
    nativeEvent: {
      contentOffset: { x: 0, y: 0 },
      contentSize: { width: 400, height: 3000 },
      layoutMeasurement: { width: 400, height: 600 },
      zoomScale: 1,
    },
  };

  async function openLongThread() {
    const scrollToEnd = jest.fn();
    jest
      .spyOn(FlatList.prototype, 'getNativeScrollRef')
      .mockReturnValue({ scrollToEnd } as unknown as ReturnType<FlatList['getNativeScrollRef']>);
    mockApi({
      [`GET ${walkPath}`]: () => ok(participantWalk()),
      [`GET ${messagesPath}`]: () =>
        ok({
          hasMore: false,
          items: Array.from({ length: 30 }, (_, i) =>
            message(`m${i}`, `Message ${i}`, at(0, 8, i)),
          ),
        }),
    });
    await openThread();
    await screen.findByText('Message 0');
    return { scrollToEnd, list: screen.getByTestId('thread-list') };
  }

  it('keeps following the newest message while the pages lay out', async () => {
    const { scrollToEnd, list } = await openLongThread();
    // Scroll events not made by the person (layout, kept position), far from the bottom.
    await fireEvent.scroll(list, farFromBottom);
    scrollToEnd.mockClear();
    await fireEvent(list, 'contentSizeChange', 400, 3400);
    expect(scrollToEnd).toHaveBeenCalled();
  });

  it('stops following once the person scrolls up to read', async () => {
    const { scrollToEnd, list } = await openLongThread();
    await fireEvent(list, 'scrollEndDrag', farFromBottom);
    scrollToEnd.mockClear();
    await fireEvent(list, 'contentSizeChange', 400, 3400);
    expect(scrollToEnd).not.toHaveBeenCalled();
  });
});

describe('paging', () => {
  it('loads older messages with before=<id of the first message>', async () => {
    const { calls } = mockApi({
      [`GET ${walkPath}`]: () => ok(organizerWalk()),
      [`GET ${messagesPath}`]: ({ path }) =>
        path.includes('before=m3')
          ? ok({
              hasMore: false,
              items: [message('m1', 'Premier', at(3)), message('m2', 'Deuxième', at(3, 10))],
            })
          : ok({
              hasMore: true,
              items: [message('m3', 'Troisième', at(0, 8)), message('m4', 'Quatrième', at(0, 9))],
            }),
    });
    await openThread();
    await screen.findByText('Troisième');
    expect(calls.find((c) => c.path.startsWith(messagesPath))!.path).toContain('limit=50');

    await fireEvent.press(screen.getByRole('button', { name: t.thread.loadOlder }));
    expect(await screen.findByText('Premier')).toBeTruthy();
    expect(screen.getByText('Quatrième')).toBeTruthy();
    expect(screen.queryByText(t.thread.loadOlder)).toBeNull();
    expect(calls.some((c) => c.path.includes('before=m3'))).toBe(true);
  });
});

describe('sending', () => {
  it('shows my message at once, then keeps the one the API returns', async () => {
    let release: (response: Response) => void = () => {};
    const { calls } = mockApi({
      [`GET ${walkPath}`]: () => ok(organizerWalk()),
      [`GET ${messagesPath}`]: () => ok({ hasMore: false, items: [] }),
      [`POST ${messagesPath}`]: () => new Promise<Response>((resolve) => (release = resolve)),
    });
    await openThread();
    await screen.findByText(t.thread.emptyTitle);

    await fireEvent.changeText(
      screen.getByLabelText(t.thread.composerLabel),
      '  Bonjour tout le monde  ',
    );
    await fireEvent.press(screen.getByRole('button', { name: t.thread.send }));

    expect(await screen.findByText('Bonjour tout le monde')).toBeTruthy();
    expect(screen.getByText(t.thread.sending)).toBeTruthy();
    expect(screen.getByLabelText(t.thread.composerLabel).props.value).toBe('');

    await act(async () =>
      release(
        jsonResponse(
          message('m9', 'Bonjour tout le monde', new Date().toISOString(), {
            isMine: true,
            author: { ...otherUser, id: testUser.id },
          }),
          201,
        ),
      ),
    );
    await waitFor(() => expect(screen.queryByText(t.thread.sending)).toBeNull());
    expect(screen.getAllByText('Bonjour tout le monde')).toHaveLength(1);
    expect(calls.find((c) => c.method === 'POST')!.json).toEqual({ text: 'Bonjour tout le monde' });
  });

  it('does not send an empty message and limits the length', async () => {
    const { calls } = mockApi({
      [`GET ${walkPath}`]: () => ok(organizerWalk()),
      [`GET ${messagesPath}`]: () => ok({ hasMore: false, items: [] }),
    });
    await openThread();
    await screen.findByText(t.thread.emptyTitle);

    await fireEvent.changeText(screen.getByLabelText(t.thread.composerLabel), '   ');
    await fireEvent.press(screen.getByRole('button', { name: t.thread.send }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    expect(screen.getByLabelText(t.thread.composerLabel).props.maxLength).toBe(1000);
    await fireEvent.changeText(screen.getByLabelText(t.thread.composerLabel), 'x'.repeat(900));
    expect(screen.getByText('900/1000')).toBeTruthy();
  });

  it('marks a failed message, then retries it', async () => {
    let attempts = 0;
    mockApi({
      [`GET ${walkPath}`]: () => ok(organizerWalk()),
      [`GET ${messagesPath}`]: () => ok({ hasMore: false, items: [] }),
      [`POST ${messagesPath}`]: () => {
        attempts += 1;
        return attempts === 1
          ? problemResponse(409, 'walk.not_open')
          : jsonResponse(message('m9', 'Coucou', new Date().toISOString(), { isMine: true }), 201);
      },
    });
    await openThread();
    await screen.findByText(t.thread.emptyTitle);

    await fireEvent.changeText(screen.getByLabelText(t.thread.composerLabel), 'Coucou');
    await fireEvent.press(screen.getByRole('button', { name: t.thread.send }));

    expect(await screen.findByText(new RegExp(t.thread.failed))).toBeTruthy();
    expect(screen.getByText(new RegExp(t.errors['walk.not_open']))).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: t.thread.retry }));
    await waitFor(() => expect(screen.queryByText(new RegExp(t.thread.failed))).toBeNull());
    expect(attempts).toBe(2);
    expect(screen.getAllByText('Coucou')).toHaveLength(1);
  });

  it('lets me discard a failed message', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(organizerWalk()),
      [`GET ${messagesPath}`]: () => ok({ hasMore: false, items: [] }),
      [`POST ${messagesPath}`]: () => problemResponse(500),
    });
    await openThread();
    await screen.findByText(t.thread.emptyTitle);
    await fireEvent.changeText(screen.getByLabelText(t.thread.composerLabel), 'Raté');
    await fireEvent.press(screen.getByRole('button', { name: t.thread.send }));
    await screen.findByText(new RegExp(t.thread.failed));

    await fireEvent.press(screen.getByRole('button', { name: t.thread.discard }));
    expect(screen.queryByText('Raté')).toBeNull();
  });
});

describe('access and cancelled walks', () => {
  it('explains why the thread is hidden from someone who is not a participant', async () => {
    const { calls } = mockApi({ [`GET ${walkPath}`]: () => ok(walkDetail()) });
    await openThread();
    expect(await screen.findByText(t.thread.hiddenReason)).toBeTruthy();
    expect(screen.queryByLabelText(t.thread.composerLabel)).toBeNull();
    expect(calls.some((c) => c.path.startsWith(messagesPath))).toBe(false);
  });

  it('shows an explanation when the API refuses the thread', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(participantWalk()),
      [`GET ${messagesPath}`]: () => problemResponse(403, 'message.forbidden'),
    });
    await openThread();
    expect(await screen.findByText(t.thread.hiddenReason)).toBeTruthy();
  });

  it('is read-only with a banner on a cancelled walk', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(organizerWalk({ status: 'Cancelled' })),
      [`GET ${messagesPath}`]: () =>
        ok({ hasMore: false, items: [message('m1', 'Dommage', at(0, 8))] }),
    });
    await openThread();
    expect(await screen.findByText('Dommage')).toBeTruthy();
    expect(screen.getByText(t.thread.readOnly)).toBeTruthy();
    expect(screen.queryByLabelText(t.thread.composerLabel)).toBeNull();
  });
});

describe('walk detail entry', () => {
  it('offers the thread to a participant and explains its absence to others', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(participantWalk()),
      [`GET ${messagesPath}`]: () => ok({ hasMore: false, items: [] }),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walkId}` });
    await fireEvent.press(await screen.findByRole('button', { name: t.thread.open }));
    await waitFor(() => expect(screen).toHavePathname(`/walks/${walkId}/messages`));
  });

  it('hides the entry from a visitor, with a sentence', async () => {
    mockApi({ [`GET ${walkPath}`]: () => ok(walkDetail()), 'GET /api/v1/me/dogs': () => ok([]) });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walkId}` });
    expect(await screen.findByText(t.thread.hiddenReason)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.thread.open })).toBeNull();
  });
});

describe('polling', () => {
  it('refetches about every 15 seconds while the screen is open', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    try {
      const { calls } = mockApi({
        [`GET ${walkPath}`]: () => ok(organizerWalk()),
        [`GET ${messagesPath}`]: () => ok({ hasMore: false, items: [] }),
      });
      const { unmount } = await openThread();
      await screen.findByText(t.thread.emptyTitle);
      const count = () => calls.filter((c) => c.path.startsWith(messagesPath)).length;
      const initial = count();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(16_000);
      });
      await waitFor(() => expect(count()).toBeGreaterThan(initial));
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('a long thread kept whole', () => {
  /** A thread of `count` messages, one per minute, ids `m1`… in order. */
  const thread = (count: number) =>
    Array.from({ length: count }, (_, i) => message(`m${i + 1}`, `Message ${i + 1}`, at(0, 8, i)));

  /** The API's paging over `all`: the latest `limit`, or those before `before`. */
  const page = (all: ReturnType<typeof thread>, path: string) => {
    const before = /before=([^&]+)/.exec(path)?.[1];
    const end = before ? all.findIndex((m) => m.id === before) : all.length;
    const items = all.slice(Math.max(0, end - 50), end);
    return ok({ items, hasMore: end - 50 > 0 });
  };

  const shownIds = () =>
    (screen.getByTestId('thread-list').props.data as { kind: string; key: string }[])
      .filter((row) => row.kind === 'message')
      .map((row) => row.key);

  async function poll() {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(16_000);
    });
  }

  it('keeps the messages at the junction when new ones arrive after loading older ones', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    try {
      let all = thread(70);
      mockApi({
        [`GET ${walkPath}`]: () => ok(organizerWalk()),
        [`GET ${messagesPath}`]: ({ path }) => page(all, path),
      });
      const { unmount } = await openThread();
      await screen.findByText(t.thread.loadOlder);
      expect(shownIds()).toHaveLength(50); // m21 … m70

      await fireEvent.press(screen.getByRole('button', { name: t.thread.loadOlder }));
      await waitFor(() => expect(shownIds()).toHaveLength(70));

      // 20 messages arrive: the latest page is now m41 … m90, and m21 … m40 only
      // exist in what was already received.
      all = thread(90);
      await poll();
      await waitFor(() => expect(shownIds()).toHaveLength(90));
      expect(shownIds()).toEqual(all.map((m) => m.id));
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reads back the messages in between when more than a page arrived at once', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    try {
      let all = thread(20);
      mockApi({
        [`GET ${walkPath}`]: () => ok(organizerWalk()),
        [`GET ${messagesPath}`]: ({ path }) => page(all, path),
      });
      const { unmount } = await openThread();
      await waitFor(() => expect(shownIds()).toHaveLength(20));

      all = thread(130);
      await poll();
      await waitFor(() => expect(shownIds()).toHaveLength(130));
      expect(shownIds()).toEqual(all.map((m) => m.id));
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the message I just sent when a poll started before the answer comes back', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    try {
      const mine = message('m9', 'Tout juste envoyé', new Date().toISOString(), {
        isMine: true,
        author: { ...otherUser, id: testUser.id },
      });
      let releasePoll: (response: Response) => void = () => {};
      let polls = 0;
      mockApi({
        [`GET ${walkPath}`]: () => ok(organizerWalk()),
        [`GET ${messagesPath}`]: () => {
          polls += 1;
          // The first read is immediate; the second one (the poll) is held.
          return polls === 2
            ? new Promise<Response>((resolve) => (releasePoll = resolve))
            : ok({ hasMore: false, items: [message('m1', 'Avant', at(0, 8))] });
        },
        [`POST ${messagesPath}`]: () => jsonResponse(mine, 201),
      });
      const { unmount } = await openThread();
      await screen.findByText('Avant');

      await poll(); // the poll leaves, and waits
      expect(polls).toBe(2);
      await fireEvent.changeText(
        screen.getByLabelText(t.thread.composerLabel),
        'Tout juste envoyé',
      );
      await fireEvent.press(screen.getByRole('button', { name: t.thread.send }));
      await waitFor(() => expect(shownIds()).toContain('m9'));

      // The held poll answers with a thread that does not know the message yet.
      await act(async () =>
        releasePoll(ok({ hasMore: false, items: [message('m1', 'Avant', at(0, 8))] })),
      );
      expect(shownIds()).toContain('m9');
      expect(screen.getAllByText('Tout juste envoyé')).toHaveLength(1);
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
