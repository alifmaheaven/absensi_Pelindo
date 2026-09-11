/**
 * Adversarial QA Test Suite for Mobile Timezone & DatePicker Evaluation
 * Author: Quality Assurance
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import DatePicker from "../components/ui/date-picker";
import {
  parseDateParts,
  todayWIB,
  parseWIBDate,
  formatDate,
  formatDateTime,
  getWIBHour,
  buildWIBScheduledTime,
} from "../utils/utils";

describe("QA Mobile Timezone & DatePicker Adversarial Verification", () => {
  describe("DatePicker logic analysis under UTC device timezone (BUG-266-04 Fix Verification)", () => {
    it("VERIFIES FIX: parseDateParts extracts calendar fields directly without timezone shifting", () => {
      // 1. Mid-month case:
      const midMonth = parseDateParts("2026-09-11");
      expect(midMonth.year).toBe(2026);
      expect(midMonth.month).toBe(8); // Month index 8 = September
      expect(midMonth.day).toBe(11);

      // 2. 1st-of-month case (previously shifted to August 31 under UTC):
      const firstOfMonth = parseDateParts("2026-09-01");
      expect(firstOfMonth.year).toBe(2026);
      expect(firstOfMonth.month).toBe(8); // Must remain September (8), NOT August (7)!
      expect(firstOfMonth.day).toBe(1); // Must remain 1st, NOT 31!

      // 3. Year-end / Year-start cases:
      const newYear = parseDateParts("2026-01-01");
      expect(newYear.year).toBe(2026);
      expect(newYear.month).toBe(0); // January
      expect(newYear.day).toBe(1);

      const yearEnd = parseDateParts("2026-12-31");
      expect(yearEnd.year).toBe(2026);
      expect(yearEnd.month).toBe(11); // December
      expect(yearEnd.day).toBe(31);
    });

    it("VERIFIES FIX: DatePicker component displays correct month and day regardless of device timezone", () => {
      const onConfirm = jest.fn();
      const onClose = jest.fn();

      // Test 1st of month:
      const { getByText, getAllByText } = render(
        React.createElement(DatePicker, {
          visible: true,
          value: "2026-09-01",
          onConfirm: onConfirm,
          onClose: onClose,
        })
      );

      // Month label must show September 2026 (not Agustus 2026)
      expect(getByText("September 2026")).toBeTruthy();

      // Confirm button emits exact "2026-09-01"
      const confirmButtons1 = getAllByText("Pilih Tanggal");
      fireEvent.press(confirmButtons1[confirmButtons1.length - 1]);
      expect(onConfirm).toHaveBeenCalledWith("2026-09-01");

      // Test mid-month:
      const onConfirmMid = jest.fn();
      const { getByText: getByTextMid, getAllByText: getAllByTextMid } = render(
        React.createElement(DatePicker, {
          visible: true,
          value: "2026-09-11",
          onConfirm: onConfirmMid,
          onClose: onClose,
        })
      );

      expect(getByTextMid("September 2026")).toBeTruthy();
      const confirmButtons2 = getAllByTextMid("Pilih Tanggal");
      fireEvent.press(confirmButtons2[confirmButtons2.length - 1]);
      expect(onConfirmMid).toHaveBeenCalledWith("2026-09-11");
    });
  });

  describe("utils.ts WIB stability under non-WIB environments", () => {
    it("formatDate formats exact date in Asia/Jakarta regardless of environment", () => {
      const formatted = formatDate("2026-09-11 08:30:00", "YYYY-MM-DD");
      expect(formatted).toBe("2026-09-11");
    });

    it("getWIBHour calculates exact UTC+7 hour deterministically", () => {
      // 10:00:00 UTC -> exactly 17:00:00 WIB
      const d = new Date("2026-09-11T10:00:00.000Z");
      expect(getWIBHour(d)).toBe(17);
    });

    it("buildWIBScheduledTime constructs Date targeting Asia/Jakarta at specified hour/minute", () => {
      const base = new Date("2026-09-11T10:00:00.000Z");
      const scheduled = buildWIBScheduledTime(base, 8, 30);
      expect(getWIBHour(scheduled)).toBe(8);
    });
  });
});
