/**
 * Tes jalur GAMBAR panel watermark dengan kanvas Skia PALSU.
 *
 * MENGAPA tes ini ada
 * -------------------
 * `applyCameraWatermark` tidak dapat dirender di Jest (Skia native), sehingga
 * regresi gambar lolos dari seluruh suite dan baru ketahuan di device. Itu
 * persis yang terjadi 2026-09-29:
 *   1. `clipRect` dipanggil dengan SATU argumen padahal kontraknya
 *      `(rect, op, doAntiAlias)` → peta meluber keluar kotaknya;
 *   2. tinggi peta disetel sama dengan tinggi panel → peta jadi strip tegak;
 *   3. PIN tidak terlihat pada hasil render.
 * Tes ini menjalankan `drawPanel` dengan objek Skia tiruan yang MEREKAM semua
 * panggilan, lalu memeriksa kontrak-kontrak tersebut secara eksplisit.
 */

import { drawPanel } from "../utils/watermark";
import {
  WATERMARK_MAP_WIDTH_RATIO,
  WATERMARK_PANEL_HEIGHT_RATIO,
  mapThumbnailHeight,
  tileRangeFor,
  watermarkMapZoom,
} from "../utils/watermarkLayout";

/** Merekam semua panggilan kanvas + menyediakan stub Skia minimal. */
function makeFakeSkia() {
  const calls: { op: string; args: any[] }[] = [];
  const record =
    (op: string) =>
    (...args: any[]) => {
      calls.push({ op, args });
      return undefined;
    };

  const makePaint = () => ({
    setColor: record("paint.setColor"),
    setAntiAlias: record("paint.setAntiAlias"),
    setStyle: record("paint.setStyle"),
    setStrokeWidth: record("paint.setStrokeWidth"),
  });

  const makePath = () => ({
    moveTo: () => makePathInstance(),
    lineTo: () => makePathInstance(),
    close: () => makePathInstance(),
  });
  let pathInstance: any;
  const makePathInstance = () => {
    pathInstance = {
      moveTo: function () { calls.push({ op: "path.moveTo", args: [...arguments] }); return this; },
      lineTo: function () { calls.push({ op: "path.lineTo", args: [...arguments] }); return this; },
      close: function () { calls.push({ op: "path.close", args: [] }); return this; },
    };
    return pathInstance;
  };

  const canvas = {
    drawRect: record("drawRect"),
    drawImageRect: record("drawImageRect"),
    drawCircle: record("drawCircle"),
    drawText: record("drawText"),
    drawPath: record("drawPath"),
    clipRect: record("clipRect"),
    save: () => { calls.push({ op: "save", args: [] }); return 1; },
    restore: () => { calls.push({ op: "restore", args: [] }); },
  };

  const font = (typeface: any, size: number) => ({
    size,
    measureText: (s: string) => ({ width: s.length * size * 0.5 }),
  });

  const Skia = {
    Paint: makePaint,
    Color: (c: string) => c,
    XYWHRect: (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h }),
    Font: (typeface: any, size: number) => font(typeface, size),
    FontMgr: { System: () => ({ matchFamilyStyle: () => ({}) }) },
    Path: { Make: () => makePath().moveTo() as any },
  };

  return { Skia, canvas, calls };
}


const CLIP_OP = { Intersect: 1, Difference: 0 };
const PAINT_STYLE = { Fill: 0, Stroke: 1 };

/** Parameter khas foto potret 895×1599 (kasus nyata yang gagal di device). */
function arrange(overrides: Record<string, any> = {}) {
  const { Skia, canvas, calls } = makeFakeSkia();
  const width = 895;
  const height = 1599;
  const mapWidth = Math.round(width * WATERMARK_MAP_WIDTH_RATIO);
  const panelHeight = Math.round(height * WATERMARK_PANEL_HEIGHT_RATIO);
  const mapHeight = mapThumbnailHeight(mapWidth, panelHeight);
  const gps = { latitude: -6.121991, longitude: 106.893849 };

  // Tile diambil dari fungsi NYATA (bukan dikarang), supaya tes mencerminkan
  // apa yang benar-benar digambar di produksi.
  const layout = tileRangeFor({
    latitude: gps.latitude,
    longitude: gps.longitude,
    zoom: watermarkMapZoom(gps.latitude),
    widthPx: mapWidth,
    heightPx: mapHeight,
  });
  const loadedTiles = layout.tiles.map((t) => ({ ...t, image: {} }));

  drawPanel({
    Skia,
    canvas,
    width,
    height,
    panelHeight,
    mapWidth,
    mapHeight,
    gps,
    address: {
      region: "Daerah Khusus Ibukota Jakarta, Indonesia",
      detail: "Jalan Berdikari, Rawa Badak Utara",
    },
    loadedTiles,
    FontWeight: { Normal: 400 },
    ClipOp: CLIP_OP,
    PaintStyle: PAINT_STYLE,
    ...overrides,
  });

  return { calls, width, height, mapWidth, panelHeight, mapHeight, gps };
}

describe("drawPanel — kontrak klip (regresi device 2026-09-29)", () => {
  it("clipRect dipanggil dengan TIGA argumen (rect, op, antiAlias)", () => {
    const { calls } = arrange();
    const clip = calls.find((c) => c.op === "clipRect");
    expect(clip).toBeDefined();
    // Inilah bug aslinya: satu argumen → klip tidak sah → peta meluber.
    expect(clip!.args).toHaveLength(3);
    expect(clip!.args[1]).toBe(CLIP_OP.Intersect);
    expect(clip!.args[2]).toBe(true);
  });

  it("menyimpan & memulihkan state kanvas (save/restore seimbang)", () => {
    const { calls } = arrange();
    const saves = calls.filter((c) => c.op === "save").length;
    const restores = calls.filter((c) => c.op === "restore").length;
    expect(saves).toBeGreaterThan(0);
    expect(saves).toBe(restores);
  });

  it("mengklip ke KOTAK PETA, bukan seluruh panel", () => {
    const { calls, mapWidth, mapHeight } = arrange();
    const clip = calls.find((c) => c.op === "clipRect")!;
    const rect = clip.args[0];
    expect(rect.width).toBe(mapWidth);
    expect(rect.height).toBe(mapHeight);
  });
});

describe("drawPanel — pin menandai titik koordinat", () => {
  it("menggambar PIN (lingkaran + ekor) di TENGAH kotak peta", () => {
    const { calls, mapWidth, mapHeight, panelHeight, height } = arrange();

    const circles = calls.filter((c) => c.op === "drawCircle");
    expect(circles.length).toBeGreaterThanOrEqual(2); // cincin putih + titik merah

    // Kotak peta dipusatkan vertikal di panel.
    const panelTop = height - panelHeight;
    const mapTop = panelTop + Math.round((panelHeight - mapHeight) / 2);
    const expectedX = mapWidth / 2;

    for (const c of circles) {
      expect(c.args[0]).toBeCloseTo(expectedX, 6);
      expect(c.args[1]).toBeGreaterThan(mapTop);
      expect(c.args[1]).toBeLessThan(mapTop + mapHeight);
    }

    // Ekor pin runcing ke bawah menunjuk koordinat.
    expect(calls.some((c) => c.op === "drawPath")).toBe(true);
    expect(calls.some((c) => c.op === "path.moveTo")).toBe(true);
  });

  it("TIDAK menggambar pin bila GPS tidak tersedia", () => {
    const { calls } = arrange({ gps: null, mapHeight: 0 });
    expect(calls.filter((c) => c.op === "drawCircle")).toHaveLength(0);
    expect(calls.some((c) => c.op === "drawPath")).toBe(false);
  });

  it("ukuran marker 2/3 ukuran sebelumnya — tidak mendominasi peta", () => {
    const { calls, mapWidth } = arrange();
    const circles = calls.filter((c) => c.op === "drawCircle");
    const maxRadius = Math.max(...circles.map((c) => c.args[2] as number));
    const expectedMax = Math.max(6, Math.round(mapWidth * 0.05)) * 1.5;
    expect(maxRadius).toBeCloseTo(expectedMax, 6);
    // Marker harus tetap minoritas dari lebar peta (tidak menutupi peta).
    expect(maxRadius * 2).toBeLessThan(mapWidth * 0.25);
  });
});

describe("drawPanel — tinggi panel (permintaan user: dikurangi 1/3)", () => {
  it("panel tidak lebih pendek dari batas yang masih memuat 4 baris teks", () => {
    const { panelHeight, width } = arrange();
    const fontSize = Math.min(88, Math.max(32, Math.round(width / 26)));
    const smallSize = Math.max(11, Math.round(fontSize * 0.62));
    const padding = Math.max(10, Math.round(fontSize * 0.5));
    const brandReserve = Math.round(fontSize * 0.9);
    const need = 4 * Math.round(smallSize * 1.35) + padding + brandReserve;
    expect(panelHeight).toBeGreaterThanOrEqual(need);
  });

  it("panel lebih pendek dari 0.28 tetapi tetap proporsional", () => {
    const { panelHeight, height } = arrange();
    const rasio = panelHeight / height;
    expect(rasio).toBeLessThan(0.28);
    expect(rasio).toBeGreaterThan(0.15);
  });
});

describe("drawPanel — peta memakai rasio aspek, bukan setinggi panel", () => {
  it("tinggi kotak peta < tinggi panel (regresi strip tegak)", () => {
    const { mapHeight, panelHeight } = arrange();
    expect(mapHeight).toBeLessThan(panelHeight);
    expect(mapHeight).toBeGreaterThan(0);
  });

  it("semua tile digambar di dalam batas kotak peta", () => {
    const { calls, mapWidth, mapHeight, panelHeight, height } = arrange();
    const panelTop = height - panelHeight;
    const mapTop = panelTop + Math.round((panelHeight - mapHeight) / 2);

    for (const c of calls.filter((x) => x.op === "drawImageRect")) {
      const src = c.args[1];
      const dest = c.args[2];
      // src WAJIB ruang gambar tile (0,0,256,256) — bug kedua yang diperbaiki.
      expect(src.x).toBe(0);
      expect(src.y).toBe(0);
      expect(src.width).toBe(256);
      expect(src.height).toBe(256);
      // Setiap tile harus BERIRISAN dengan kotak peta (koordinat kanvas
      // absolut). Tile yang menyentuh tepi jendela memang menjorok keluar —
      // klip `clipRect(..., Intersect, ...)` yang memotongnya.
      const intersects =
        dest.x < mapWidth &&
        dest.x + dest.width > 0 &&
        dest.y < mapTop + mapHeight &&
        dest.y + dest.height > mapTop;
      expect(intersects).toBe(true);
    }
  });
});

describe("drawPanel — atribusi OSM & branding", () => {
  it("menampilkan atribusi OSM saat tile asli dipakai", () => {
    const { calls } = arrange();
    const texts = calls.filter((c) => c.op === "drawText").map((c) => c.args[0]);
    expect(texts.some((t: string) => t.includes("OpenStreetMap"))).toBe(true);
  });

  it("TIDAK menampilkan atribusi OSM pada fallback skematik (tanpa tile)", () => {
    const { calls } = arrange({ loadedTiles: [] });
    const texts = calls.filter((c) => c.op === "drawText").map((c) => c.args[0]);
    expect(texts.some((t: string) => t.includes("OpenStreetMap"))).toBe(false);
    // Grid skematik tetap digambar supaya pengguna tahu ini titik koordinat.
    expect(calls.filter((c) => c.op === "drawRect").length).toBeGreaterThan(2);
  });

  it("selalu menampilkan branding pemilik bukti", () => {
    const { calls } = arrange();
    const texts = calls.filter((c) => c.op === "drawText").map((c) => c.args[0]);
    expect(texts.some((t: string) => t.includes("PT Prakhya Tama Cakrawala"))).toBe(true);
  });
});

describe("drawPanel — wilayah panjang tidak terpotong sia-sia", () => {
  it("menampilkan seluruh nama wilayah panjang (bukan 'Jakarta,…')", () => {
    const { calls } = arrange();
    const texts = calls
      .filter((c) => c.op === "drawText")
      .map((c) => String(c.args[0]));
    // Nama wilayah harus muncul UTUH di salah satu baris (boleh dipecah
    // menjadi beberapa baris font kecil), bukan dipotong dengan elipsis.
    const joined = texts.join(" ");
    expect(joined).toContain("Indonesia");
    expect(joined).toContain("Jakarta");
  });
});
