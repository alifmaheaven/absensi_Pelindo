import { Stack } from "expo-router";

export default function NoTabsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
