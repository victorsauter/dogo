// In-memory replacement for expo-secure-store, shared by every test.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

beforeEach(() => {
  (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store.clear();
});

// jest-expo's automatic mock of expo-network returns no subscription.
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

// expo-file-system's `File` is native. In tests it is a real `Blob` (Node's),
// so multipart bodies built with it are encoded and can be read back.
jest.mock('expo-file-system', () => {
  const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
  class File extends Blob {
    readonly uri: string;
    readonly name: string;
    constructor(uri: string) {
      const name = uri.split('/').pop() ?? 'file';
      super([new Uint8Array(JPEG_MAGIC)], { type: /\.jpe?g$/i.test(name) ? 'image/jpeg' : '' });
      this.uri = uri;
      this.name = name;
    }
  }
  return { File, Paths: {} };
});

// Maps are native: in tests a map is a View that forwards its events (fire
// `regionChangeComplete` or `press` on it), and each marker a View labelled by its title.
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MapView = React.forwardRef(function MapView(
    props: Record<string, unknown> & { children?: React.ReactNode },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
    return React.createElement(
      View,
      {
        testID: props.testID as string | undefined,
        accessibilityLabel: props.accessibilityLabel as string | undefined,
        ...({
          onRegionChangeComplete: props.onRegionChangeComplete,
          onPress: props.onPress,
        } as object),
      },
      props.children,
    );
  });
  const Marker = (props: { title?: string; onCalloutPress?: () => void; onDragEnd?: unknown }) =>
    React.createElement(View, {
      testID: 'map-marker',
      accessibilityLabel: props.title,
      ...({ onCalloutPress: props.onCalloutPress, onDragEnd: props.onDragEnd } as object),
    });
  return { __esModule: true, default: MapView, Marker };
});

// Location: granted, in Altkirch (near the default centre, Seppois-le-Haut), unless a test overrides these mocks.
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getLastKnownPositionAsync: jest.fn(async () => ({
    coords: { latitude: 47.6234, longitude: 7.2376 },
  })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 47.6234, longitude: 7.2376 },
  })),
}));

type Listener = (...args: never[]) => void;
type Emit = (...args: unknown[]) => void;

// Notifications: the module is only loaded when an EAS project ID is configured
// (never by default), and this mock stands in for it in the tests that do set one.
// `__reset()` restores the defaults: permission undetermined, a token available.
jest.mock('expo-notifications', () => {
  const state = {
    permission: { granted: false, status: 'undetermined' as string, canAskAgain: true },
    token: 'ExponentPushToken[test-token]',
    received: new Set<Listener>(),
    responses: new Set<Listener>(),
    last: null as unknown,
  };
  const subscribe = (set: Set<Listener>) => (listener: Listener) => {
    set.add(listener);
    return { remove: jest.fn(() => set.delete(listener)) };
  };
  const mock = {
    __state: state,
    __reset() {
      state.permission = { granted: false, status: 'undetermined', canAskAgain: true };
      state.token = 'ExponentPushToken[test-token]';
      state.received.clear();
      state.responses.clear();
      state.last = null;
    },
    /** Delivers a notification tap (`data` is the payload) to the listeners. */
    __tap(data: unknown) {
      const response = { notification: { request: { content: { data } } } };
      state.responses.forEach((listener) => (listener as unknown as Emit)(response));
    },
    /** Delivers a notification received in the foreground. */
    __receive(data: unknown) {
      const notification = { request: { content: { data } } };
      state.received.forEach((listener) => (listener as unknown as Emit)(notification));
    },
    AndroidImportance: { DEFAULT: 3 },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => ({ ...state.permission })),
    requestPermissionsAsync: jest.fn(async () => {
      state.permission = { granted: true, status: 'granted', canAskAgain: true };
      return { ...state.permission };
    }),
    getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: state.token })),
    addNotificationReceivedListener: jest.fn(subscribe(state.received)),
    addNotificationResponseReceivedListener: jest.fn(subscribe(state.responses)),
    getLastNotificationResponse: jest.fn(() => state.last),
    clearLastNotificationResponse: jest.fn(() => {
      state.last = null;
    }),
  };
  return mock;
});
