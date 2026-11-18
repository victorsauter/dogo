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
// `regionChangeComplete` or `press` on it) and its `mapPadding`, and each marker a View labelled by its title
// (or its accessibility label), forwarding `press` and `calloutPress`.
jest.mock('react-native-maps', () => {
  // Shared by every map: tests read `jest.requireMock('react-native-maps').__animateToRegion`.
  const animateToRegion = jest.fn();
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MapView = React.forwardRef(function MapView(
    props: Record<string, unknown> & { children?: React.ReactNode },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({ animateToRegion }));
    return React.createElement(
      View,
      {
        testID: props.testID as string | undefined,
        accessibilityLabel: props.accessibilityLabel as string | undefined,
        ...({
          onRegionChangeComplete: props.onRegionChangeComplete,
          onPress: props.onPress,
          mapPadding: props.mapPadding,
        } as object),
      },
      props.children,
    );
  });
  const Marker = (props: {
    title?: string;
    accessibilityLabel?: string;
    onPress?: () => void;
    onCalloutPress?: () => void;
    onDragEnd?: unknown;
  }) =>
    React.createElement(View, {
      testID: 'map-marker',
      accessibilityLabel: props.accessibilityLabel ?? props.title,
      ...({
        onPress: props.onPress,
        onCalloutPress: props.onCalloutPress,
        onDragEnd: props.onDragEnd,
      } as object),
    });
  return { __esModule: true, default: MapView, Marker, __animateToRegion: animateToRegion };
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

// Gesture handler: its own mocks (GestureHandlerRootView becomes a View).
require('react-native-gesture-handler/jestSetup');

// The sliding panel (@gorhom/bottom-sheet) runs on Reanimated. In tests it is a
// View whose `snapToIndex(i)` reports `onChange(i)` at once, its current
// position exposed as `accessibilityValue.now` on the `bottom-sheet` testID;
// `BottomSheetFlatList` is a plain FlatList.
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { FlatList, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const BottomSheet = React.forwardRef(function BottomSheet(
    props: { index?: number; onChange?: (index: number) => void; children?: React.ReactNode },
    ref: React.Ref<unknown>,
  ) {
    const [current, setCurrent] = React.useState(props.index ?? 0);
    const snapToIndex = (next: number) => {
      setCurrent(next);
      props.onChange?.(next);
    };
    React.useImperativeHandle(ref, () => ({
      snapToIndex,
      expand: () => snapToIndex(2),
      collapse: () => snapToIndex(0),
      close: () => snapToIndex(-1),
    }));
    return React.createElement(
      View,
      { testID: 'bottom-sheet', accessibilityValue: { now: current } },
      props.children,
    );
  });
  const BottomSheetFlatList = React.forwardRef(function BottomSheetFlatList(
    props: Record<string, unknown>,
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: jest.fn(), scrollToOffset: jest.fn() }));
    return React.createElement(FlatList as never, props);
  });
  return { __esModule: true, default: BottomSheet, BottomSheetFlatList, BottomSheetView: View };
});

// The system menu of iOS (@expo/ui) is native: tests use the app's own menu
// (`AnchoredMenu`), as on Android.
jest.mock('@/components/nativeMenu', () => ({ NativeMenuView: null }));

// Haptics do nothing in tests; tests may check they were asked for.
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
}));

// The blur of the floating materials is native: a plain View in tests.
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { BlurView: View };
});

// Liquid Glass is native: a plain View in tests (its props can be read), and
// unavailable (the blur is used) unless a test makes both checks return true.
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GlassView: View,
    GlassContainer: View,
    isLiquidGlassAvailable: jest.fn(() => false),
    isGlassEffectAPIAvailable: jest.fn(() => false),
  };
});
