const expoModulesCorePath = require("path").dirname(require.resolve("expo-modules-core/package.json"));

module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
  ],
  moduleNameMapper: {
    "^react-native/setup-env$": "<rootDir>/__tests__/mockSetupEnv.js",
    "^expo-modules-core$": expoModulesCorePath,
    "^expo-modules-core/(.*)$": `${expoModulesCorePath}/$1`,
  },
};
