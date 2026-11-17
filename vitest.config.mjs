import { configDefaults, defineConfig } from 'vitest/config';

// tests/build/ checks the built site in dist/, so it runs after `npm run build`, from
// scripts/check-build.mjs (SITE_BUILD_TESTS=1). `npm test` runs everything else.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ...(process.env.SITE_BUILD_TESTS ? [] : ['tests/build/**'])],
  },
});
