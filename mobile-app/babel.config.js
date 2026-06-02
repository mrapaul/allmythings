module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Inline Drizzle .sql migration files as strings (paired with the
      // metro.config.js sourceExts entry) so Babel does not parse them as JS.
      ['inline-import', { extensions: ['.sql'] }],
      'react-native-reanimated/plugin',
    ],
  };
};
