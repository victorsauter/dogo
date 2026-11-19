// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'coverage/*', 'src/api/schema.d.ts']),
  expoConfig,
  prettierConfig,
  {
    // Navigations triggered by a press go through one guard against repeated taps (src/lib/navigation.ts).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/navigation.ts', 'src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-router',
              importNames: ['useRouter'],
              message:
                "Use useGuardedRouter from '@/lib/navigation': it ignores a repeated tap on the same destination.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'jest.config.js', 'jest.global-setup.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
      },
    },
  },
]);
