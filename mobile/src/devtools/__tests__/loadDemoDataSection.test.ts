import { config } from '@/lib/config';

import { loadDemoDataSection } from '..';

const mutableConfig = config as { devLogin: boolean };

describe('loadDemoDataSection', () => {
  const initial = mutableConfig.devLogin;
  afterEach(() => {
    mutableConfig.devLogin = initial;
  });

  it('loads the demo data section when the test sign-in is on', () => {
    mutableConfig.devLogin = true;
    expect(loadDemoDataSection()).not.toBeNull();
  });

  it('loads nothing without the test sign-in', () => {
    mutableConfig.devLogin = false;
    expect(loadDemoDataSection()).toBeNull();
  });
});
