/**
 * Tes helper MURNI panel watermark peta (utils/watermarkLayout.ts).
 *
 * Yang diuji di sini adalah matematika yang paling mudah salah dan paling
 * mahal akibatnya di lapangan: proyeksi tile (kalau salah, peta menunjuk
 * lokasi yang salah pada bukti) dan pemenggalan teks alamat.
 *
 * Proyeksi diverifikasi terhadap nilai yang dapat dihitung independen
 * (round-trip + titik acuan yang diketahui), bukan sekadar "tidak NaN".
 */
import {
  clampLines,
  formatAddressLines,
  latToTileY,
  lonToTileX,
  mapThumbnailHeight,
  tileRangeFor,
  watermarkFontSize,
  watermarkMapZoom,
  wrapTextToWidth,
} from "../utils/watermarkLayout";

/** Implementasi independen (invers) untuk membuktikan round-trip. */
function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
function tileXToLon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

describe("watermarkLayout — skala 2× (permintaan user)", () => {
  it("menggandakan ukuran font dibanding rumus lama (width/52, jepit 16–44)", () => {
    const oldSize = (w: number) => Math.min(44, Math.max(16, Math.round(w / 52)));
    // Pada lebar umum (di atas jepitan bawah, di bawah jepitan atas):
    // 1280 → lama 25, baru harus 2×.
    expect(oldSize(1280)).toBe(25);
    expect(watermarkFontSize(1280)).toBe(49);
    expect(watermarkFontSize(2080)).toBe(80);
  });

  it("tetap di dalam jepitan pada foto sangat kecil dan sangat besar", () => {
    expect(watermarkFontSize(100)).toBe(32); // jepit bawah
    expect(watermarkFontSize(5000)).toBe(88); // jepit atas
  });
});

describe("watermarkLayout — proyeksi Web Mercator", () => {
  it("menempatkan bujur 0 di tengah peta (z0)", () => {
    expect(lonToTileX(0, 0)).toBeCloseTo(0.5, 10);
  });

  it("menempatkan khatulistiwa di tengah peta (z0)", () => {
    expect(latToTileY(0, 0)).toBeCloseTo(0.5, 10);
  });

  it("menjepit lintang ekstrem agar tidak menghasilkan Infinity/NaN", () => {
    // tan(90°) tak berhingga — tanpa jepitan ini hasilnya NaN.
    expect(Number.isFinite(latToTileY(90, 10))).toBe(true);
    expect(Number.isFinite(latToTileY(-90, 10))).toBe(true);
  });

  it("round-trip lintang/bujur kembali ke koordinat semula (sub-meter)", () => {
    const z = 16;
    for (const [lat, lon] of [
      [-6.8885, 109.6754],
      [0, 0],
      [47.36559, 8.524997],
      [-34.6, -58.38],
    ] as const) {
      const fx = lonToTileX(lon, z);
      const fy = latToTileY(lat, z);
      const backLat = tileYToLat(fy, z);
      const backLon = tileXToLon(fx, z);
      expect(Math.abs(backLat - lat)).toBeLessThan(1e-6);
      expect(Math.abs(backLon - lon)).toBeLessThan(1e-6);
    }
  });
});

describe("watermarkLayout — tileRangeFor (jendela absolut mercator)", () => {
  const base = {
    latitude: -6.8885,
    longitude: 109.6754,
    zoom: 16,
    widthPx: 358,
    heightPx: 240,
  };

  /** Cek union rect semua tile menutup penuh jendela [0,w]×[0,h] — tanpa gap. */
  function covered(
    layout: ReturnType<typeof tileRangeFor>,
    w: number,
    h: number,
  ): boolean {
    // Sederhana dan cukup: sampling rapat + tepi. (Union rect axis-aligned
    // yang menutup semua titik sampel dengan langkah 8px praktis menjamin
    // penutupan penuh untuk kisi rect yang berasal dari kisi tile 256px.)
    for (let x = 0; x <= w; x += 8) {
      for (let y = 0; y <= h; y += 8) {
        const inside = layout.tiles.some(
          (t) =>
            x >= t.drawX && x < t.drawX + t.size &&
            y >= t.drawY && y < t.drawY + t.size,
        );
        if (!inside) return false;
      }
    }
    return true;
  }

  it("menutup penuh jendela thumbnail — tidak ada celah (gap) di tepi", () => {
    // Geser koordinat agar pin jatuh di berbagai posisi dalam tile.
    for (const dlat of [0, 0.0013, 0.0027]) {
      const layout = tileRangeFor({
        ...base,
        latitude: base.latitude + dlat,
      });
      expect(covered(layout, base.widthPx, base.heightPx)).toBe(true);
    }
  });

  it("memusatkan koordinat: pin implisit dari penempatan tile == proyeksi koordinat", () => {
    const layout = tileRangeFor(base);
    // Ambil satu tile (kasus tanpa pembungkusan: x == rawX), balik posisinya
    // menjadi origin jendela, lalu hitung posisi pin implisit:
    //   originX = rawX*256 - drawX/scale ;  pin = origin + jendela/2
    const t = layout.tiles[0];
    const originX = t.x * 256 - t.drawX / layout.scale;
    const impliedPinX = originX + layout.windowMapWidth / 2;
    const expectedPinX = lonToTileX(base.longitude, base.zoom) * 256;
    expect(impliedPinX).toBeCloseTo(expectedPinX, 6);

    const originY = t.y * 256 - t.drawY / layout.scale;
    const impliedPinY = originY + layout.windowMapHeight / 2;
    const expectedPinY = latToTileY(base.latitude, base.zoom) * 256;
    expect(impliedPinY).toBeCloseTo(expectedPinY, 6);

    // Konsekuensinya: pin jatuh TEPAT di tengah thumbnail.
    expect(impliedPinX - originX).toBeCloseTo(base.widthPx / 2, 6);
    expect(impliedPinY - originY).toBeCloseTo(base.heightPx / 2, 6);
  });

  it("jumlah tile terbatas — maksimum 9 (anggaran kuota/waktu)", () => {
    // Posisi pin yang paling sial (di tepi tile) sekalipun.
    for (const dlon of [0, 0.001, 0.002, 0.003]) {
      const layout = tileRangeFor({ ...base, longitude: base.longitude + dlon });
      expect(layout.tiles.length).toBeLessThanOrEqual(9);
      expect(layout.tiles.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("skala 1 (tajam 1:1) untuk thumbnail kecil; naik untuk yang besar", () => {
    const kecil = tileRangeFor(base);
    expect(kecil.scale).toBe(1);

    // Foto jalur gallery-folder (tanpa kompresi) bisa 4000px → mapWidth besar.
    const besar = tileRangeFor({ ...base, widthPx: 1120, heightPx: 840 });
    expect(besar.scale).toBeGreaterThan(1);
    expect(besar.windowMapWidth).toBeLessThanOrEqual(512);
    expect(besar.windowMapHeight).toBeLessThanOrEqual(512);
    // Tetap tanpa gap dan terbatas 9 tile.
    expect(covered(besar, 1120, 840)).toBe(true);
    expect(besar.tiles.length).toBeLessThanOrEqual(9);
  });

  it("membungkus sumbu X pada antimeridian — indeks URL selalu valid", () => {
    const layout = tileRangeFor({
      latitude: 0,
      longitude: 179.99,
      zoom: 3,
      widthPx: 128,
      heightPx: 128,
    });
    expect(layout.tiles.length).toBeGreaterThan(0);
    for (const t of layout.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(Math.pow(2, 3));
    }
  });

  it("menolak tile di luar kutub proyeksi alih-alih koordinat tak sah", () => {
    // latToTileY menjepit ±85.05° — jendela valid tidak pernah keluar Y.
    const layout = tileRangeFor({
      latitude: 84.9,
      longitude: 0,
      zoom: 4,
      widthPx: 128,
      heightPx: 128,
    });
    for (const t of layout.tiles) {
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(Math.pow(2, 4));
    }
  });
});

describe("watermarkLayout — tinggi thumbnail peta (rasio aspek)", () => {
  // REGRESI 2026-09-29: versi pertama menyetel tinggi peta == tinggi panel,
  // sehingga pada foto potret 895×1599 peta menjadi strip tegak 251×448.
  it("memakai rasio aspek tetap, bukan setinggi panel", () => {
    const mapWidth = Math.round(895 * 0.28); // 251
    const panelHeight = Math.round(1599 * 0.28); // 448
    const h = mapThumbnailHeight(mapWidth, panelHeight);
    // 251 * 0.75 ≈ 188 — jauh lebih pendek dari 448 (panel).
    expect(h).toBe(188);
    expect(h).toBeLessThan(panelHeight);
    // Rasio hasil mendekati 0.75 (bukan 1.78 seperti bug lama).
    expect(h / mapWidth).toBeCloseTo(0.75, 2);
  });

  it("tidak pernah melebihi tinggi panel (dengan margin)", () => {
    // Lebar besar + panel pendek → dibatasi panel.
    const h = mapThumbnailHeight(600, 200);
    expect(h).toBeLessThanOrEqual(200);
    expect(h).toBeGreaterThan(0);
  });

  it("tetap positif pada nilai ekstrem (tidak 0/negatif)", () => {
    expect(mapThumbnailHeight(251, 40)).toBeGreaterThan(0);
    expect(mapThumbnailHeight(1, 10)).toBeGreaterThan(0);
  });
});

describe("watermarkLayout — zoom peta", () => {
  it("memakai z16 di lintang Indonesia (detail jalan/gedung)", () => {
    expect(watermarkMapZoom(-6.8885)).toBe(16);
  });

  it("turun ke z15 di lintang tinggi (Mercator memperbesar jarak per piksel)", () => {
    expect(watermarkMapZoom(60)).toBe(15);
    expect(watermarkMapZoom(-60)).toBe(15);
  });
});

describe("watermarkLayout — format alamat Nominatim", () => {
  it("menyusun baris wilayah + detail seperti gambar referensi", () => {
    const res = formatAddressLines({
      address: {
        road: "Jl. Industri III",
        village: "Karangmalang",
        city: "Kota Pekalongan",
        state: "Jawa Tengah",
        country: "Indonesia",
      },
    });
    expect(res.region).toBe("Kota Pekalongan, Jawa Tengah, Indonesia");
    expect(res.detail).toBe("Jl. Industri III, Karangmalang");
  });

  it("membuang bagian duplikat (Nominatim kadang mengulang nilai sama)", () => {
    const res = formatAddressLines({
      address: { city: "Pekalongan", county: "Pekalongan", country: "Indonesia" },
    });
    expect(res.region).toBe("Pekalongan, Indonesia");
  });

  it("mengembalikan null (bukan string kosong/karangan) bila address kosong", () => {
    expect(formatAddressLines({})).toEqual({ region: null, detail: null });
    expect(formatAddressLines(null)).toEqual({ region: null, detail: null });
    expect(formatAddressLines(undefined)).toEqual({ region: null, detail: null });
  });

  it("tetap benar bila hanya sebagian field tersedia", () => {
    const res = formatAddressLines({ address: { road: "Jalan Hasanuddin" } });
    expect(res.region).toBeNull();
    expect(res.detail).toBe("Jalan Hasanuddin");
  });
});

describe("watermarkLayout — pemenggalan teks", () => {
  /** Pengukur monotonik: setiap karakter 10 px. */
  const measure = (s: string) => s.length * 10;

  it("memenggal pada batas kata, tidak memotong kata", () => {
    const lines = wrapTextToWidth("Jl. Industri III Karangmalang", 150, measure);
    expect(lines).toEqual(["Jl. Industri", "III", "Karangmalang"]);
    for (const l of lines) expect(l).not.toMatch(/^\s|\s$/);
  });

  it("membiarkan kata yang lebih panjang dari satu baris utuh (tidak dipotong)", () => {
    // Memotong kata alamat akan menyesatkan pembaca bukti.
    const lines = wrapTextToWidth("JalanYangSangatPanjangSekali", 50, measure);
    expect(lines).toEqual(["JalanYangSangatPanjangSekali"]);
  });

  it("mengembalikan array kosong untuk teks kosong", () => {
    expect(wrapTextToWidth("", 100, measure)).toEqual([]);
    expect(wrapTextToWidth("   ", 100, measure)).toEqual([]);
  });

  it("clampLines menandai pemotongan dengan elipsis", () => {
    expect(clampLines(["a", "b", "c", "d"], 2)).toEqual(["a", "b…"]);
    expect(clampLines(["a", "b"], 5)).toEqual(["a", "b"]);
    expect(clampLines(["a", "b"], 0)).toEqual([]);
  });

  it("tidak menggandakan elipsis bila baris terakhir sudah memilikinya", () => {
    expect(clampLines(["a", "b…", "c"], 2)).toEqual(["a", "b…"]);
  });
});
