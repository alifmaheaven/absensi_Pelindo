jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import React from "react";
import { render, act } from "@testing-library/react-native";
import StandardSkeleton from "@/components/ui/StandardSkeleton";
import RoutineListSkeleton from "@/components/daily-routine/RoutineListSkeleton";
import ScheduleSkeleton from "@/components/ui/ScheduleSkeleton";

// Regression guard for the `useAnimatedValue` refactor: the skeleton must
// still mount, loop its animation, and unmount cleanly.
describe("skeleton animation (useAnimatedValue)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("renders, loops, and unmounts without crashing", () => {
    for (const C of [StandardSkeleton, RoutineListSkeleton, ScheduleSkeleton]) {
      const { unmount } = render(<C />);
      act(() => { jest.advanceTimersByTime(2400); });
      unmount();
    }
  });

  it("keeps output stable across re-renders (value identity is stable)", () => {
    const { rerender, toJSON } = render(<StandardSkeleton />);
    const first = JSON.stringify(toJSON());
    rerender(<StandardSkeleton />);
    expect(JSON.stringify(toJSON())).toBe(first);
  });
});
