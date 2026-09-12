module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 moved its Babel plugin into react-native-worklets.
      // `react-native-reanimated/plugin` still resolves, but only as a re-export
      // shim, so depend on the real path. This must stay last in the list.
      'react-native-worklets/plugin',
    ],
  };
};
