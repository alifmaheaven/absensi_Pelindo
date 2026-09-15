import { parseWIBDate } from "../utils/utils";

function calculateLeaveDays(startDateStr?: string | null, endDateStr?: string | null): number {
  if (!startDateStr) return 1;
  const cleanStart = startDateStr.split(/[T ]/)[0];
  const cleanEnd = (endDateStr || startDateStr).split(/[T ]/)[0];
  if (!cleanEnd || cleanEnd === cleanStart) return 1;
  const start = parseWIBDate(cleanStart);
  const end = parseWIBDate(cleanEnd);
  if (!start || !end) return 1;
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

const DAY_ORDER = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_MAP: Record<string, number> = {
  minggu: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
};

function getNextDayShortName(dayName?: string, dateStr?: string): string {
  if (dayName) {
    const clean = dayName.trim().toLowerCase();
    if (clean in DAY_MAP) {
      const nextIdx = (DAY_MAP[clean] + 1) % 7;
      return DAY_ORDER[nextIdx];
    }
  }
  if (dateStr) {
    const d = parseWIBDate(dateStr.includes(" ") ? dateStr : `${dateStr} 00:00:00`);
    if (d) {
      d.setDate(d.getDate() + 1);
      return DAY_ORDER[d.getDay()];
    }
  }
  return "";
}

describe("Jadwal & Izin Screen UX Logic", () => {
  describe("calculateLeaveDays", () => {
    it("returns 1 for single-day leave without end_date", () => {
      expect(calculateLeaveDays("2026-09-15")).toBe(1);
    });

    it("returns 1 when start_date equals end_date", () => {
      expect(calculateLeaveDays("2026-09-15", "2026-09-15")).toBe(1);
    });

    it("returns 3 for 3-day date range (inclusive)", () => {
      expect(calculateLeaveDays("2026-09-15", "2026-09-17")).toBe(3);
    });

    it("handles ISO date strings with timestamps safely", () => {
      expect(calculateLeaveDays("2026-09-15T08:00:00", "2026-09-16T17:00:00")).toBe(2);
    });

    it("returns 1 fallback when start date is null or invalid", () => {
      expect(calculateLeaveDays(null)).toBe(1);
      expect(calculateLeaveDays("invalid-date")).toBe(1);
    });
  });

  describe("getNextDayShortName for Overnight Shifts", () => {
    it("correctly advances day name cyclically", () => {
      expect(getNextDayShortName("Senin")).toBe("Sel");
      expect(getNextDayShortName("Selasa")).toBe("Rab");
      expect(getNextDayShortName("Rabu")).toBe("Kam");
      expect(getNextDayShortName("Kamis")).toBe("Jum");
      expect(getNextDayShortName("Jumat")).toBe("Sab");
      expect(getNextDayShortName("Sabtu")).toBe("Min");
      expect(getNextDayShortName("Minggu")).toBe("Sen");
    });

    it("handles lowercase and trimmed day names safely", () => {
      expect(getNextDayShortName("  selasa  ")).toBe("Rab");
      expect(getNextDayShortName("sabtu")).toBe("Min");
    });
  });

  describe("Filter Category Logic for Izin Screen", () => {
    const mockItems = [
      { id: "1", type: "leave_request", leave_type: "cuti", status: "Disetujui", rawStatus: "approved", title: "Cuti" },
      { id: "2", type: "leave_request", leave_type: "izin", status: "Pending", rawStatus: "pending", title: "Izin" },
      { id: "3", type: "leave_request", leave_type: "izin", status: "Ditolak", rawStatus: "rejected", title: "Izin" },
      { id: "4", type: "attendance", status: "Disetujui", title: "Sakit" },
    ];

    it("correctly filters by category", () => {
      const cuti = mockItems.filter(
        (it) => it.leave_type === "cuti" || it.title.toLowerCase().includes("cuti")
      );
      expect(cuti).toHaveLength(1);
      expect(cuti[0].id).toBe("1");

      const izin = mockItems.filter(
        (it) => it.leave_type === "izin" || (it.type === "attendance" && !it.title.toLowerCase().includes("cuti"))
      );
      expect(izin).toHaveLength(3);

      const approved = mockItems.filter(
        (it) => it.status.toLowerCase() === "disetujui" || it.rawStatus?.toLowerCase() === "approved"
      );
      expect(approved).toHaveLength(2);

      const pending = mockItems.filter(
        (it) => it.status.toLowerCase() === "pending" || it.rawStatus?.toLowerCase() === "pending"
      );
      expect(pending).toHaveLength(1);

      const rejected = mockItems.filter(
        (it) => it.status.toLowerCase() === "ditolak" || it.rawStatus?.toLowerCase() === "rejected"
      );
      expect(rejected).toHaveLength(1);
    });
  });
});
