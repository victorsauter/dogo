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

// Location: granted, in Paris, unless a test overrides these mocks.
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getLastKnownPositionAsync: jest.fn(async () => ({
    coords: { latitude: 48.8566, longitude: 2.3522 },
  })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 48.8566, longitude: 2.3522 },
  })),
}));
