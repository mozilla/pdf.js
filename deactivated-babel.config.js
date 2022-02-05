module.exports = function (api) {
  api.cache(false);
  const presets = [
    [
      "@babel/preset-env",
      {
        corejs: { version: 3 },
        useBuiltIns: "usage",
        targets: {
//          "android": "4.0.0",
          "chrome": "87",
          "edge": "95",
          "firefox": "78",
//          "ie": "11",
          "ios": "12.2",
          "opera": "80",
          "safari": "13.1",
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
