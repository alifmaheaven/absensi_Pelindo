/**
 * WAVE-0 / UIUX-C.2 — gerbang tes untuk utils/location-diagnostics.ts.
 * Menjamin: pemetaan murni, tiga pesan A/B/C BEDA kata-per-kata (U-16),
 * angka timeout pesan C = konstanta kode, tidak ada 'Coba Lagi' utk penolakan
 * izin, jarak aktual pada copy gerbang radius (UIUX-04), dan tidak ada lagi
 * sisa bahasa Inggris.
 */
import {
  LOCATION_FIX_TIMEOUT_MS,
  classifyLocationFailure,
  containsLegacyEnglish,
  formatOutOfRangeCopy,
  getLocationFailureCopy,
} from "@/utils/location-diagnostics";

describe("classifyLocationFailure (A→B→C berurutan)", () => {
  it("A: izin tidak granted → PERMISSION, walau layanan mati & tanpa fix", () => {
    expect(
      classifyLocationFailure({ permissionStatus: "denied", servicesEnabled: false, hasFix: false }),
    ).toBe("PERMISSION");
  });

  it("B: izin granted tapi layanan lokasi mati → SERVICES", () => {
    expect(
      classifyLocationFailure({ permissionStatus: "granted", servicesEnabled: false, hasFix: false }),
    ).toBe("SERVICES");
  });

  it("C: izin granted, layanan hidup, tanpa fix → NO_FIX", () => {
    expect(
      classifyLocationFailure({ permissionStatus: "granted", servicesEnabled: true, hasFix: false }),
    ).toBe("NO_FIX");
  });

  it("probe layanan gagal (undefined) TIDAK boleh dituduh SERVICES — lanjut ke NO_FIX", () => {
    expect(
      classifyLocationFailure({ permissionStatus: "granted", servicesEnabled: undefined, hasFix: false }),
    ).toBe("NO_FIX");
  });

  it("fix ada tanpa masalah → null", () => {
    expect(
      classifyLocationFailure({ permissionStatus: "granted", servicesEnabled: true, hasFix: true }),
    ).toBeNull();
  });
});

describe("copy per penyebab (rubrik C.2 / gerbang U-16)", () => {
  const A = getLocationFailureCopy("PERMISSION");
  const B = getLocationFailureCopy("SERVICES");
  const C = getLocationFailureCopy("NO_FIX");

  it("tiga pesan A/B/C BERBEDA kata-per-kata (judul & isi pairwise distinct)", () => {
    const titles = [A.title, B.title, C.title];
    const messages = [A.message, B.message, C.message];
    expect(new Set(titles).size).toBe(3);
    expect(new Set(messages).size).toBe(3);
    expect(A.message).not.toContain(B.message.slice(0, 40));
    expect(B.message).not.toContain(C.message.slice(0, 40));
  });

  it("'Coba Lagi' TIDAK ditawarkan pasca penolakan izin (A)", () => {
    expect(A.actions).not.toContain("RETRY");
    expect(A.actions).toEqual(["OPEN_SETTINGS"]);
  });

  it("SERVICES menawarkan aksi hidupkan layanan sebagai aksi primer", () => {
    expect(B.actions[0]).toBe("ENABLE_SERVICES");
  });

  it("angka timeout di pesan C = konstanta kode (±N detik)", () => {
    expect(C.message).toContain(`±${LOCATION_FIX_TIMEOUT_MS / 1000} detik`);
  });

  it("semua pesan menyebut konsekuensi tanpa bypass + kontak pengawas sebagai PROSA", () => {
    for (const copy of [A, B, C]) {
      expect(copy.message).toMatch(/pengawas/i);
      expect(containsLegacyEnglish(copy.message)).toBe(false);
    }
    // 'Hubungi Pengawas' bukan tombol: tidak ada aksi kontak di daftar aksi
    const contactActions = [A, B, C]
      .flatMap((x) => x.actions as string[])
      .filter((a) => a === "CONTACT");
    expect(contactActions).toHaveLength(0);
  });

  it("gerbang deteksi legacy Inggris bekerja", () => {
    expect(containsLegacyEnglish("You must be within range of the selected site to check in.")).toBe(true);
  });
});

describe("formatOutOfRangeCopy (UIUX-04, penyebab D)", () => {
  it("menampilkan jarak aktual ter-bulatkan dan radius, bukan copy Inggris", () => {
    const copy = formatOutOfRangeCopy({
      distanceMeters: 412.6,
      toleranceMeters: 150,
      siteName: "Terminal 3",
    });
    expect(copy.message).toContain("413 m");
    expect(copy.message).toContain("150 m");
    expect(copy.message).toContain('"Terminal 3"');
    expect(containsLegacyEnglish(copy.message)).toBe(false);
  });

  it("site tanpa radius: pesan menyebut admin, tetap menolak", () => {
    const copy = formatOutOfRangeCopy({ distanceMeters: 60, toleranceMeters: null });
    expect(copy.message).toMatch(/belum diatur administrator/);
    expect(containsLegacyEnglish(copy.message)).toBe(false);
  });

  it("jarak tak terhitung tidak melempar NaN ke user", () => {
    const copy = formatOutOfRangeCopy({ distanceMeters: NaN, toleranceMeters: 50 });
    expect(copy.message).not.toMatch(/NaN/);
  });
});
