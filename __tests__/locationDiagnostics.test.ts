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

/**
 * Ambang UIUX-02 (diamandemen 2026-09-18) jadi ASSERTION CI, bukan mata
 * manusia: total ≤220 char, kalimat pertama mandiri ≤80 char, tiap langkah
 * list ≤40 char. Berlaku utk SEMUA pesan diagnosis (A/B/C/D) + varian D.
 */
describe("UIUX-02 ambang copy (assertion CI)", () => {
  const firstSentence = (msg: string): string => {
    // kalimat pertama = sampai '.' pertama yang diikuti spasi+kapital/akhir
    const m = msg.match(/^(.*?\.)\s/);
    return (m ? m[1] : msg).trim();
  };

  const cases: { name: string; copy: ReturnType<typeof getLocationFailureCopy> }[] = [
    { name: "A PERMISSION", copy: getLocationFailureCopy("PERMISSION") },
    { name: "B SERVICES", copy: getLocationFailureCopy("SERVICES") },
    { name: "C NO_FIX", copy: getLocationFailureCopy("NO_FIX") },
    { name: "D OUT_OF_RANGE basis", copy: getLocationFailureCopy("OUT_OF_RANGE") },
    {
      name: "D varian radius terisi",
      copy: formatOutOfRangeCopy({ distanceMeters: 413, toleranceMeters: 150, siteName: "Terminal 3" }),
    },
    {
      name: "D varian tanpa radius",
      copy: formatOutOfRangeCopy({ distanceMeters: 60, toleranceMeters: null, siteName: "Gudang" }),
    },
  ];

  it.each(cases)("$name: total ≤220 char", ({ copy }) => {
    expect(copy.message.length).toBeLessThanOrEqual(220);
  });

  it.each(cases)("$name: kalimat pertama ≤80 char", ({ copy }) => {
    expect(firstSentence(copy.message).length).toBeLessThanOrEqual(80);
  });

  it.each(cases)("$name: tiap langkah list ≤40 char", ({ copy }) => {
    for (const step of copy.steps ?? []) {
      expect(step.length).toBeLessThanOrEqual(40);
    }
  });
});
