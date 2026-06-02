const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;
// Drizzle ships migrations as .sql files imported from db/migrations/migrations.js;
// Metro must treat .sql as a source extension to bundle them.
config.resolver.sourceExts.push('sql');
// Keep test files out of the app bundle. Expo Router's require.context eagerly
// bundles every file under app/, so colocated *.test.tsx would otherwise pull
// vitest/chai into the production bundle and break it.
const testFiles = /.*\.(test|spec)\.[jt]sx?$/;
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, testFiles)
  : testFiles;
module.exports = config;
