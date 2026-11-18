/* eslint-disable @typescript-eslint/no-require-imports -- modules are loaded after jest.doMock */
describe('push module that cannot be loaded', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-notifications');
    jest.dontMock('@/lib/config');
  });

  it('is unavailable, silently', async () => {
    jest.doMock('expo-notifications', () => {
      throw new Error('Cannot find native module ExpoPushTokenManager');
    });
    jest.doMock('@/lib/config', () => ({ config: { apiUrl: 'x', easProjectId: 'project-id' } }));
    const registration = require('../registration') as typeof import('../registration');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(registration.getPermissionState()).resolves.toBe('unavailable');
    await expect(registration.registerDevice()).resolves.toBeUndefined();
    await expect(registration.unregisterDevice()).resolves.toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
