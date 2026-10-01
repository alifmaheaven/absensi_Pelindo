/**
 * Tes alur unduh galeri (utils/galleryDownload.ts) dengan modul native di-mock.
 *
 * MENGAPA tes ini penting
 * -----------------------
 * 1. `photo.url` dari backend adalah presigned URL S3 yang hanya berlaku
 *    **60 detik**. Bila `downloadGalleryFile` memakai URL dari parameter
 *    (bukan hasil `refreshUrl`), unduhan akan 403 untuk foto yang sudah lama
 *    tampil di layar — persis jenis bug yang tidak terlihat di dev.
 * 2. `expo-media-library` SDK 56: `saveToLibraryAsync` THROW saat runtime;
 *    yang benar `Asset.create`. Tes ini mengunci pemakaian API yang benar.
 * 3. Kegagalan harus TERLAPOR (bukan diam-diam sukses) supaya layar bisa
 *    memberi pesan jujur.
 */

import { downloadGalleryFile } from "../utils/galleryDownload";

const mockDownloadAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();

// Nama PROPERTI harus tetap nama asli modul (bukan nama variabel mock);
// variabelnya sendiri wajib berawalan "mock" agar lolos aturan Jest.
jest.mock("expo-file-system/legacy", () => {
  const mod = {
    cacheDirectory: "file:///cache/",
    getInfoAsync: (...a: any[]) => mockGetInfoAsync(...a),
    makeDirectoryAsync: (...a: any[]) => mockMakeDirectoryAsync(...a),
    deleteAsync: (...a: any[]) => mockDeleteAsync(...a),
    readDirectoryAsync: (...a: any[]) => mockReadDirectoryAsync(...a),
    downloadAsync: (...a: any[]) => mockDownloadAsync(...a),
  };
  return { ...mod, default: mod };
});

const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
jest.mock("expo-sharing", () => {
  const mod = {
    isAvailableAsync: () => mockIsAvailableAsync(),
    shareAsync: (...a: any[]) => mockShareAsync(...a),
  };
  return { ...mod, default: mod };
});

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockAssetCreate = jest.fn();
jest.mock("expo-media-library", () => {
  const mod = {
    getPermissionsAsync: (...a: any[]) => mockGetPermissionsAsync(...a),
    requestPermissionsAsync: (...a: any[]) => mockRequestPermissionsAsync(...a),
    Asset: { create: (...a: any[]) => mockAssetCreate(...a) },
  };
  return { ...mod, default: mod };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInfoAsync.mockResolvedValue({ exists: true });
  mockMakeDirectoryAsync.mockResolvedValue(undefined);
  mockDeleteAsync.mockResolvedValue(undefined);
  mockDownloadAsync.mockResolvedValue({ status: 200, uri: "file:///cache/gallery-downloads/f.jpg" });
  mockGetPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
  mockAssetCreate.mockResolvedValue({ id: "asset-1" });
  mockIsAvailableAsync.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
});

const imageFile = {
  id: "p1",
  originalName: "Bukti.jpg",
  mimeType: "image/jpeg",
  url: "https://s3/stale.jpg?X-Amz-Signature=OLD",
};

describe("downloadGalleryFile — URL presigned harus SEGAR", () => {
  it("mengunduh dari hasil refreshUrl, BUKAN dari url yang tersimpan", async () => {
    const refreshUrl = jest.fn().mockResolvedValue("https://s3/fresh.jpg?X-Amz-Signature=NEW");

    const outcome = await downloadGalleryFile({ file: imageFile, refreshUrl });

    expect(refreshUrl).toHaveBeenCalledTimes(1);
    // Inilah inti perlindungannya: URL lama (yang mungkin sudah kedaluwarsa)
    // tidak boleh dipakai.
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      "https://s3/fresh.jpg?X-Amz-Signature=NEW",
      expect.stringContaining("Bukti.jpg"),
    );
    expect(mockDownloadAsync).not.toHaveBeenCalledWith(
      expect.stringContaining("X-Amz-Signature=OLD"),
      expect.anything(),
    );
    expect(outcome.status).toBe("saved");
  });

  it("melaporkan error jujur bila tautan segar tidak tersedia", async () => {
    const outcome = await downloadGalleryFile({
      file: imageFile,
      refreshUrl: async () => null,
    });
    expect(outcome.status).toBe("error");
    expect(mockDownloadAsync).not.toHaveBeenCalled();
  });
});

describe("downloadGalleryFile — simpan gambar ke galeri media", () => {
  it("memakai Asset.create (API SDK 56), bukan saveToLibraryAsync yang throw", async () => {
    const outcome = await downloadGalleryFile({
      file: imageFile,
      refreshUrl: async () => "https://s3/fresh.jpg",
    });
    expect(mockAssetCreate).toHaveBeenCalledWith(
      "file:///cache/gallery-downloads/f.jpg",
    );
    expect(outcome.status).toBe("saved");
    if (outcome.status === "saved") {
      expect(outcome.fileName).toBe("Bukti.jpg");
    }
  });

  it("menawarkan Share sheet bila izin media DITOLAK (tidak menyerah diam-diam)", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    const outcome = await downloadGalleryFile({
      file: imageFile,
      refreshUrl: async () => "https://s3/fresh.jpg",
    });

    expect(mockAssetCreate).not.toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalled();
    expect(outcome.status).toBe("shared");
  });

  it("meminta izin bila belum diberikan tetapi masih boleh ditanya", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });

    const outcome = await downloadGalleryFile({
      file: imageFile,
      refreshUrl: async () => "https://s3/fresh.jpg",
    });

    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(mockAssetCreate).toHaveBeenCalled();
    expect(outcome.status).toBe("saved");
  });

  it("melaporkan permission-denied bila izin ditolak DAN share tidak tersedia", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    mockIsAvailableAsync.mockResolvedValue(false);

    const outcome = await downloadGalleryFile({
      file: imageFile,
      refreshUrl: async () => "https://s3/fresh.jpg",
    });
    expect(outcome.status).toBe("permission-denied");
  });
});

describe("downloadGalleryFile — file non-gambar (PDF)", () => {
  it("memakai Share sheet, bukan galeri media", async () => {
    const outcome = await downloadGalleryFile({
      file: {
        id: "d1",
        originalName: "Laporan.pdf",
        mimeType: "application/pdf",
        url: "https://s3/lama.pdf",
      },
      refreshUrl: async () => "https://s3/fresh.pdf",
    });

    expect(mockAssetCreate).not.toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalled();
    expect(outcome.status).toBe("shared");
  });
});

describe("downloadGalleryFile — kegagalan dilaporkan, bukan disembunyikan", () => {
  it("melaporkan error saat server menolak (HTTP non-200)", async () => {
    mockDownloadAsync.mockResolvedValue({ status: 403, uri: "file:///x" });
    const outcome = await downloadGalleryFile({
      file: imageFile,
      refreshUrl: async () => "https://s3/fresh.jpg",
    });
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toContain("403");
    }
  });

  it("melaporkan error saat unduhan melempar (jaringan mati)", async () => {
    mockDownloadAsync.mockRejectedValue(new Error("Network request failed"));
    const outcome = await downloadGalleryFile({
      file: imageFile,
      refreshUrl: async () => "https://s3/fresh.jpg",
    });
    expect(outcome.status).toBe("error");
  });

  it("tidak pernah throw ke pemanggil (kontrak fail-soft untuk UI)", async () => {
    mockDownloadAsync.mockRejectedValue(new Error("boom"));
    await expect(
      downloadGalleryFile({ file: imageFile, refreshUrl: async () => "u" }),
    ).resolves.toBeDefined();
  });
});
