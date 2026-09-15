const path = require("path");
const MOBILE = path.resolve(__dirname, "..");
module.exports = {
  rootDir: MOBILE,
  preset: "jest-expo",
  testMatch: ["<rootDir>/.audit-tmp/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^react-native/setup-env$": "<rootDir>/__tests__/mockSetupEnv.js",
    "^expo-modules-core$": "<rootDir>/node_modules/expo/node_modules/expo-modules-core",
    "^expo-modules-core/(.*)$": "<rootDir>/node_modules/expo/node_modules/expo-modules-core/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
  ],
};
