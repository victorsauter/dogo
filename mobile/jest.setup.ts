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
