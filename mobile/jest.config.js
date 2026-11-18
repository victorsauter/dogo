/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  clearMocks: true,
  // The first screen test of a run compiles the whole app (routes, map, sliding
  // panel). On a cold cache, as in CI, that alone takes longer than Jest's 5 s.
  testTimeout: 30000,
};
