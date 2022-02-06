module.exports = function (api) {
  api.cache(false);
  const presets = [
    [
      "@babel/preset-env",
      {
        corejs: { version: 3 },
        useBuiltIns: "usage",
        targets: {
          "chrome": "73",
          "edge": "95",
          "firefox": "68",
          "ios": "12.2",
          "opera": "80",
          "safari": "13.0",
          "samsung": "13.0",
        },
      },
    ],
  ];
  const plugins = [
    "@babel/plugin-transform-modules-commonjs",
    [
      "@babel/plugin-transform-runtime",
      {
        helpers: false,
        regenerator: true,
      },
    ],
  ];
  return {
    presets,
    plugins,
  };
};
