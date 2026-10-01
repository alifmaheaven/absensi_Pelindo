/**
 * Tes helper MURNI fitur unduh galeri (utils/galleryDownloadText.ts).
 *
 * Fokus pada penamaan file di disk — bagian yang paling mudah salah dan
 * akibatnya langsung terasa oleh pengguna (file tanpa ekstensi tidak bisa
 * dibuka; nama dengan karakter terlarang gagal disimpan; dua file saling
 * menimpa).
 */
import {
  buildDownloadFileName,
  extensionFromMime,
  extractExtension,
  formatFileSize,
  fromGalleryPhoto,
  isImageFile,
  isPdfFile,
  resolveExtension,
  sanitizeFileName,
} from "../utils/galleryDownloadText";

describe("galleryDownloadText — ekstensi", () => {
  it("mengambil ekstensi dari nama file", () => {
    expect(extractExtension("Laporan.pdf")).toBe("pdf");
    expect(extractExtension("Foto Kegiatan.JPG")).toBe("jpg");
  });

  it("mengabaikan query/hash (URL presigned S3)", () => {
    // Presigned URL S3 punya query tanda tangan — ekstensi harus tetap terbaca.
    expect(extractExtension("dokumen.pdf?X-Amz-Signature=abc123")).toBe("pdf");
    expect(extractExtension("foto.png#frag")).toBe("png");
  });

  it("mengembalikan null bila tidak ada ekstensi", () => {
    expect(extractExtension("tanpa-ekstensi")).toBeNull();
    expect(extractExtension("")).toBeNull();
    expect(extractExtension(null)).toBeNull();
  });

  it("menebak ekstensi dari MIME", () => {
    expect(extensionFromMime("application/pdf")).toBe("pdf");
    expect(extensionFromMime("image/jpeg")).toBe("jpg");
    expect(extensionFromMime("image/png")).toBe("png");
    // Subtipe MIME dipakai apa adanya (bukan tabel khusus).
    expect(extensionFromMime("text/plain")).toBe("plain");
    expect(extensionFromMime("")).toBeNull();
  });

  it("resolveExtension: nama → MIME → URL → bin (jaring pengaman)", () => {
    // Nama menang.
    expect(
      resolveExtension({ originalName: "a.pdf", mimeType: "image/jpeg" }),
    ).toBe("pdf");
    // Nama tanpa ekstensi → MIME.
    expect(resolveExtension({ originalName: "a", mimeType: "image/png" })).toBe(
      "png",
    );
    // Tidak ada nama & MIME → URL.
    expect(resolveExtension({ url: "https://x/y/foto.webp?sig=1" })).toBe("webp");
    // Tidak ada petunjuk sama sekali → "bin" (bukan string kosong).
    expect(resolveExtension({})).toBe("bin");
  });
});

describe("galleryDownloadText — sanitasi nama file", () => {
  it("membuang pemisah path (mencegah penulisan ke luar folder)", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("folder/sub/foto.jpg")).toBe("foto.jpg");
    expect(sanitizeFileName("folder\\sub\\foto.jpg")).toBe("foto.jpg");
  });

  it("mengganti karakter terlarang di filesystem", () => {
    expect(sanitizeFileName('la:p*o?r"a<n>|an.pdf')).toBe("la-p-o-r-a-n-an.pdf");
  });

  it("merapikan spasi berlebih dan spasi di tepi", () => {
    expect(sanitizeFileName("  foto   kegiatan  .jpg  ")).toBe(
      "foto kegiatan .jpg",
    );
  });

  it("menolak nama berbahaya/kosong sebagai null", () => {
    expect(sanitizeFileName("..")).toBeNull();
    expect(sanitizeFileName(".")).toBeNull();
    expect(sanitizeFileName("   ")).toBeNull();
    expect(sanitizeFileName(null)).toBeNull();
  });
});

describe("galleryDownloadText — nama file final", () => {
  it("memakai nama asli bila sudah punya ekstensi", () => {
    expect(
      buildDownloadFileName({ originalName: "Laporan Bulanan.pdf" }),
    ).toBe("Laporan Bulanan.pdf");
  });

  it("menambahkan ekstensi bila nama tidak punya", () => {
    expect(
      buildDownloadFileName({ originalName: "Laporan", mimeType: "application/pdf" }),
    ).toBe("Laporan.pdf");
  });

  it("memakai nama cadangan unik bila server tidak mengirim nama", () => {
    // Tanpa cadangan, dua file tanpa nama akan saling menimpa.
    const a = buildDownloadFileName({ id: "abc-123", mimeType: "image/jpeg" });
    const b = buildDownloadFileName({ id: "def-456", mimeType: "image/jpeg" });
    expect(a).toBe("gallery-abc-123.jpg");
    expect(b).toBe("gallery-def-456.jpg");
    expect(a).not.toBe(b);
  });

  it("selalu menghasilkan nama dengan ekstensi', juga untuk input buruk", () => {
    for (const file of [
      { originalName: "..", id: "x" },
      { originalName: "nama tanpa ekstensi" },
      {},
      { originalName: 'a:b*c?.pdf' },
    ]) {
      const name = buildDownloadFileName(file);
      expect(name.length).toBeGreaterThan(0);
      expect(name).not.toMatch(/[/\\]/);
      expect(extractExtension(name)).toBeTruthy();
    }
  });
});

describe("galleryDownloadText — klasifikasi tipe", () => {
  it("mengenali gambar dari MIME dan dari ekstensi", () => {
    expect(isImageFile({ mimeType: "image/jpeg" })).toBe(true);
    expect(isImageFile({ originalName: "foto.PNG" })).toBe(true);
    // Bentuk langsung dari API galeri (snake_case).
    expect(isImageFile({ mime_type: "image/webp", original_name: "x" })).toBe(true);
  });

  it("tidak menganggap PDF sebagai gambar", () => {
    expect(isImageFile({ mimeType: "application/pdf", originalName: "a.pdf" })).toBe(false);
  });

  it("mengenali PDF dari MIME dan ekstensi (kedua bentuk field)", () => {
    expect(isPdfFile({ mimeType: "application/pdf" })).toBe(true);
    expect(isPdfFile({ originalName: "Surat.PDF" })).toBe(true);
    expect(isPdfFile({ mime_type: "application/pdf", original_name: "s.pdf" })).toBe(true);
  });
});

describe("galleryDownloadText — fromGalleryPhoto", () => {
  it("memetakan field snake_case galeri → bentuk unduhan", () => {
    expect(
      fromGalleryPhoto({
        id: "p1",
        original_name: "Bukti.jpg",
        mime_type: "image/jpeg",
        url: "https://x/y.jpg?sig=1",
        file_size: 1234,
      }),
    ).toEqual({
      id: "p1",
      originalName: "Bukti.jpg",
      mimeType: "image/jpeg",
      url: "https://x/y.jpg?sig=1",
    });
  });

  it("aman untuk field yang hilang", () => {
    expect(fromGalleryPhoto({})).toEqual({
      id: null,
      originalName: null,
      mimeType: null,
      url: null,
    });
  });
});

describe("galleryDownloadText — ukuran file", () => {
  it("memformat ukuran dalam satuan yang enak dibaca (locale id)", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_258_291)).toBe("1,2 MB");
  });

  it("mengembalikan null untuk nilai tidak valid (bukan 'NaN MB')", () => {
    expect(formatFileSize(null)).toBeNull();
    expect(formatFileSize(undefined)).toBeNull();
    expect(formatFileSize(-5)).toBeNull();
    expect(formatFileSize(NaN)).toBeNull();
  });
});
