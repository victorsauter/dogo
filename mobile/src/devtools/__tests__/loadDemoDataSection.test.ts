import { config } from '@/lib/config';

import { loadDemoDataSection } from '..';

const mutableConfig = config as { devLogin: boolean };
const globals = globalThis as unknown as { __DEV__: boolean };

describe('loadDemoDataSection', () => {
  const initial = mutableConfig.devLogin;
  afterEach(() => {
    mutableConfig.devLogin = initial;
    globals.__DEV__ = true;
  });

  it('loads the demo data section in a development build with the test sign-in', () => {
    mutableConfig.devLogin = true;
    expect(loadDemoDataSection()).not.toBeNull();
  });

  it('loads nothing without the test sign-in', () => {
    mutableConfig.devLogin = false;
    expect(loadDemoDataSection()).toBeNull();
  });

  it('loads nothing outside a development build, even with the test sign-in', () => {
    mutableConfig.devLogin = true;
    globals.__DEV__ = false;
    expect(loadDemoDataSection()).toBeNull();
  });
});
