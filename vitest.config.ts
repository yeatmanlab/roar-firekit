import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist', 'coverage', '__fixtures__', '__utils__', '__mocks__', 'lib'],
    globals: true,
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['node_modules/', '__tests__/', '__fixtures__/', '__utils__/', '__mocks__/', 'lib/'],
    },
  },
});
