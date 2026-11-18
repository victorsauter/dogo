import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import {
  DEFAULT_DISCOVER_LAYOUT,
  DISCOVER_LAYOUT_STORAGE_KEY,
  parseDiscoverLayout,
  resetDiscoverLayout,
  setDiscoverLayout,
  useDiscoverLayout,
} from '@/discover/layoutPreference';

const stored = () =>
  (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store.get(
    DISCOVER_LAYOUT_STORAGE_KEY,
  );

beforeEach(() => resetDiscoverLayout());

/** Holds the next read of the device storage until the test resolves it. */
function deferredRead() {
  let resolve!: (value: string | null) => void;
  jest
    .mocked(SecureStore.getItemAsync)
    .mockReturnValueOnce(new Promise<string | null>((done) => (resolve = done)));
  return { resolve };
}

describe('parseDiscoverLayout', () => {
  it('keeps the two known values and falls back to the panel for anything else', () => {
    expect(DEFAULT_DISCOVER_LAYOUT).toBe('panel');
    expect(parseDiscoverLayout('list')).toBe('list');
    expect(parseDiscoverLayout('panel')).toBe('panel');
    expect(parseDiscoverLayout('current')).toBe('panel');
    expect(parseDiscoverLayout('nonsense')).toBe('panel');
    expect(parseDiscoverLayout(null)).toBe('panel');
  });
});

describe('useDiscoverLayout', () => {
  it('is null while the stored choice is being read, then the panel when nothing is stored', async () => {
    const read = deferredRead();
    const { result } = await renderHook(() => useDiscoverLayout());
    expect(result.current.layout).toBeNull();

    await act(async () => read.resolve(null));
    expect(result.current.layout).toBe('panel');
  });

  it('reads the stored choice', async () => {
    await SecureStore.setItemAsync(DISCOVER_LAYOUT_STORAGE_KEY, 'list');
    const { result } = await renderHook(() => useDiscoverLayout());
    await waitFor(() => expect(result.current.layout).toBe('list'));
  });

  it.each(['current', 'nonsense', ''])(
    'falls back to the panel for the stored value %p',
    async (value) => {
      await SecureStore.setItemAsync(DISCOVER_LAYOUT_STORAGE_KEY, value);
      const { result } = await renderHook(() => useDiscoverLayout());
      await waitFor(() => expect(result.current.layout).toBe('panel'));
    },
  );

  it('falls back to the panel when the device storage cannot be read', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('keychain locked'));
    const { result } = await renderHook(() => useDiscoverLayout());
    await waitFor(() => expect(result.current.layout).toBe('panel'));
  });

  it('remembers a choice on the device', async () => {
    const { result } = await renderHook(() => useDiscoverLayout());
    await waitFor(() => expect(result.current.layout).toBe('panel'));

    await act(async () => result.current.setLayout('list'));
    expect(result.current.layout).toBe('list');
    await waitFor(() => expect(stored()).toBe('list'));
  });

  it('is observable: every user of the preference sees a change at once', async () => {
    const tab = await renderHook(() => useDiscoverLayout());
    const settings = await renderHook(() => useDiscoverLayout());
    await waitFor(() => expect(tab.result.current.layout).toBe('panel'));

    await act(async () => settings.result.current.setLayout('list'));
    expect(tab.result.current.layout).toBe('list');

    await act(async () => setDiscoverLayout('panel'));
    expect(tab.result.current.layout).toBe('panel');
    expect(settings.result.current.layout).toBe('panel');
  });

  it('survives a restart: a new session reads what was stored', async () => {
    const first = await renderHook(() => useDiscoverLayout());
    await waitFor(() => expect(first.result.current.layout).toBe('panel'));
    await act(async () => first.result.current.setLayout('list'));
    await waitFor(() => expect(stored()).toBe('list'));
    await first.unmount();

    resetDiscoverLayout(); // the app is relaunched: memory is empty, the device keeps the value
    const second = await renderHook(() => useDiscoverLayout());
    await waitFor(() => expect(second.result.current.layout).toBe('list'));
  });

  it('keeps a choice made before the stored value came back', async () => {
    const read = deferredRead();
    const { result } = await renderHook(() => useDiscoverLayout());
    await act(async () => result.current.setLayout('list'));

    await act(async () => read.resolve('panel'));
    expect(result.current.layout).toBe('list');
    expect(stored()).toBe('list');
  });
});
