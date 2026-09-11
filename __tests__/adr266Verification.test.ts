jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
  },
}));

jest.mock("../stores/auth", () => ({
  useAuthStore: {
    getState: () => ({
      logout: jest.fn(),
      setUser: jest.fn(),
    }),
  },
}));

import {
  validateEvidenceFile,
  resolveEvidenceType,
  normalizeTranscodedImageMetadata,
  isHeicAsset,
  getHeicTranscodeErrorMessage,
  resolveTranscodedAsset,
  EvidenceType,
} from "../utils/dailyRoutineHelpers";
import { uploadDailyRoutineTemp } from "../services/dailyRoutine";
import axios from "../lib/axios";
import { getAttachedFiles, IItemState } from "../components/daily-routine/ChecklistItemCard";
import {
  parseWIBDate,
  formatDate,
  formatDateTime,
  getWIBHour,
  buildWIBScheduledTime,
  todayWIB,
} from "../utils/utils";
import { formatDDMMM } from "../components/daily-routine/RoutineProgressCard";

describe("ADR-266 Verification Test Suite", () => {
  describe("Task A: Evidence Type Policy & Multi-Evidence (OD-4)", () => {
    describe("validateEvidenceFile policy enforcement", () => {
      it("photo: accepts jpg, png, webp <= 5MB", () => {
        expect(
          validateEvidenceFile(
            { name: "foto.jpg", mimeType: "image/jpeg", size: 1024 * 1024 },
            "photo"
          )
        ).toEqual({ valid: true });

        expect(
          validateEvidenceFile(
            { name: "foto.png", mimeType: "image/png", size: 2 * 1024 * 1024 },
            "photo"
          )
        ).toEqual({ valid: true });

        expect(
          validateEvidenceFile(
            { name: "foto.webp", mimeType: "image/webp", size: 500 * 1024 },
            "photo"
          )
        ).toEqual({ valid: true });
      });

      it("photo: rejects pdf with expected UX error", () => {
        const res = validateEvidenceFile(
          { name: "document.pdf", mimeType: "application/pdf", size: 1024 * 1024 },
          "photo"
        );
        expect(res.valid).toBe(false);
        expect(res.error).toContain("hanya menerima bukti foto (JPG, PNG, WEBP)");
      });

      it("both: accepts images and rejects pdf", () => {
        expect(
          validateEvidenceFile(
            { name: "foto.jpg", mimeType: "image/jpeg", size: 1024 * 1024 },
            "both"
          )
        ).toEqual({ valid: true });

        const res = validateEvidenceFile(
          { name: "document.pdf", mimeType: "application/pdf", size: 1024 * 1024 },
          "both"
        );
        expect(res.valid).toBe(false);
        expect(res.error).toContain("hanya menerima bukti foto (JPG, PNG, WEBP)");
      });

      it("file: accepts images and pdf", () => {
        expect(
          validateEvidenceFile(
            { name: "foto.jpg", mimeType: "image/jpeg", size: 1024 * 1024 },
            "file"
          )
        ).toEqual({ valid: true });

        expect(
          validateEvidenceFile(
            { name: "laporan.pdf", mimeType: "application/pdf", size: 2 * 1024 * 1024 },
            "file"
          )
        ).toEqual({ valid: true });
      });

      it("all types: reject svg format unconditionally", () => {
        const types: EvidenceType[] = ["photo", "both", "file", "none"];
        types.forEach((t) => {
          const resExt = validateEvidenceFile(
            { name: "icon.svg", mimeType: "image/svg+xml", size: 100 * 1024 },
            t
          );
          expect(resExt.valid).toBe(false);
          expect(resExt.error).toContain("Format berkas SVG tidak didukung");
        });
      });

      it("all types: reject files exceeding 5MB", () => {
        const types: EvidenceType[] = ["photo", "both", "file"];
        types.forEach((t) => {
          const res = validateEvidenceFile(
            { name: "big.jpg", mimeType: "image/jpeg", size: 6 * 1024 * 1024 },
            t
          );
          expect(res.valid).toBe(false);
          expect(res.error).toContain("melebihi batas 5MB");
        });
      });

      it("HEIC: pre-transcode asset is rejected, but once transcoded passes photo and both", () => {
        const rawHeic = {
          name: "IMG_0042.HEIC",
          mimeType: "image/heic",
          size: 8 * 1024 * 1024,
        };

        // 1. Sebelum transcode: ditolak oleh photo dan both karena format HEIC dan ukuran > 5MB
        const prePhoto = validateEvidenceFile(rawHeic, "photo");
        expect(prePhoto.valid).toBe(false);

        const preBoth = validateEvidenceFile(rawHeic, "both");
        expect(preBoth.valid).toBe(false);

        // 2. Normalisasi metadata pasca-transcode: stem terjaga, ekstensi .jpg, mime image/jpeg
        const normalized = normalizeTranscodedImageMetadata(rawHeic.name);
        expect(normalized.name).toBe("IMG_0042.jpg");
        expect(normalized.mimeType).toBe("image/jpeg");

        // 3. Setelah transcode: lolos validasi untuk photo dan both
        const transcoded = {
          name: normalized.name,
          mimeType: normalized.mimeType,
          size: 500 * 1024,
          uri: "file:///data/cache/IMG_0042.jpg",
        };

        const postPhoto = validateEvidenceFile(transcoded, "photo");
        expect(postPhoto.valid).toBe(true);

        const postBoth = validateEvidenceFile(transcoded, "both");
        expect(postBoth.valid).toBe(true);
      });

      it("real non-image files fail in every mode (photo, both, file, none)", () => {
        const modes: EvidenceType[] = ["photo", "both", "file", "none"];
        const nonImageFiles = [
          { name: "archive.zip", mimeType: "application/zip", size: 500 * 1024 },
          { name: "script.sh", mimeType: "text/x-shellscript", size: 10 * 1024 },
          {
            name: "document.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 200 * 1024,
          },
          { name: "audio.mp3", mimeType: "audio/mpeg", size: 1024 * 1024 },
        ];

        for (const file of nonImageFiles) {
          for (const mode of modes) {
            const res = validateEvidenceFile(file, mode);
            expect(res.valid).toBe(false);
          }
        }
      });

      it("SVG still fails in every mode (OD-4 stored-XSS prevention)", () => {
        const modes: EvidenceType[] = ["photo", "both", "file", "none"];
        const svgFile = {
          name: "vector.svg",
          mimeType: "image/svg+xml",
          size: 50 * 1024,
        };

        for (const mode of modes) {
          const res = validateEvidenceFile(svgFile, mode);
          expect(res.valid).toBe(false);
          expect(res.error).toContain("Format berkas SVG tidak didukung");
        }
      });

      it("handles HEIC transcode failure honestly with Indonesian informative error", () => {
        const rawHeic = {
          fileName: "IMG_0042.HEIC",
          mimeType: "image/heic",
        };
        expect(isHeicAsset(rawHeic)).toBe(true);

        const errorMsg = getHeicTranscodeErrorMessage(rawHeic.fileName);
        expect(errorMsg).toContain("Gagal mengonversi foto HEIC");
        expect(errorMsg).toContain("IMG_0042.HEIC");
        expect(errorMsg).toContain("Silakan gunakan format JPG atau PNG");
      });

      it("resolveTranscodedAsset preserves stem, applies .jpg and avoids false rejection from pre-compression size", async () => {
        const rawAsset = {
          uri: "ph://12345",
          fileName: "IMG_0042.HEIC",
          mimeType: "image/heic",
          fileSize: 8 * 1024 * 1024, // 8MB
        };

        const resolved = await resolveTranscodedAsset(
          rawAsset,
          "file:///cache/transcoded.jpg",
          "gallery-1"
        );

        expect(resolved.name).toBe("IMG_0042.jpg");
        expect(resolved.mimeType).toBe("image/jpeg");
        expect(resolved.isTranscoded).toBe(true);
        // Pastikan ukuran bukan lagi 8MB ukuran mentah pra-kompresi
        expect(resolved.size).not.toBe(rawAsset.fileSize);
        if (resolved.size !== null) {
          expect(resolved.size).toBeLessThanOrEqual(5 * 1024 * 1024);
        }

        const validRes = validateEvidenceFile(
          {
            name: resolved.name,
            mimeType: resolved.mimeType,
            size: resolved.size,
            uri: resolved.uri,
          },
          "photo"
        );
        expect(validRes.valid).toBe(true);
      });

      describe("OD-4 / NFR-07 File Size Precedence and Fallback Hardening", () => {
        afterEach(() => {
          jest.restoreAllMocks();
        });

        it("transcoded file whose compressed size is under the cap PASSES even when raw asset was over 5 MB", async () => {
          // Mock fetch to simulate successful local measurement of transcoded file (750 KB)
          jest.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
            Promise.resolve({
              headers: {
                get: (header: string) =>
                  header.toLowerCase() === "content-length" ? String(750 * 1024) : null,
              },
              blob: () => Promise.resolve({ size: 750 * 1024 } as Blob),
            } as unknown as Response)
          );

          const rawAsset = {
            uri: "ph://photo-large",
            fileName: "camera_capture.jpg",
            mimeType: "image/jpeg",
            fileSize: 9 * 1024 * 1024, // 9 MB raw
          };

          const resolved = await resolveTranscodedAsset(
            rawAsset,
            "file:///cache/compressed_output.jpg",
            "camera-1"
          );

          expect(resolved.isTranscoded).toBe(true);
          expect(resolved.size).toBe(750 * 1024);

          const validation = validateEvidenceFile(
            {
              name: resolved.name,
              mimeType: resolved.mimeType,
              size: resolved.size,
              uri: resolved.uri,
            },
            "photo"
          );
          expect(validation.valid).toBe(true);
        });

        it("transcoded file whose compressed size still exceeds 5 MB is REJECTED", async () => {
          // Mock fetch returning 5.5 MB compressed
          jest.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
            Promise.resolve({
              headers: {
                get: (header: string) =>
                  header.toLowerCase() === "content-length" ? String(5.5 * 1024 * 1024) : null,
              },
              blob: () => Promise.resolve({ size: 5.5 * 1024 * 1024 } as Blob),
            } as unknown as Response)
          );

          const rawAsset = {
            uri: "ph://photo-huge",
            fileName: "huge_panorama.jpg",
            mimeType: "image/jpeg",
            fileSize: 15 * 1024 * 1024,
          };

          const resolved = await resolveTranscodedAsset(
            rawAsset,
            "file:///cache/compressed_huge.jpg",
            "camera-huge"
          );

          expect(resolved.isTranscoded).toBe(true);
          expect(resolved.size).toBe(5.5 * 1024 * 1024);

          const validation = validateEvidenceFile(
            {
              name: resolved.name,
              mimeType: resolved.mimeType,
              size: resolved.size,
              uri: resolved.uri,
            },
            "photo"
          );
          expect(validation.valid).toBe(false);
          expect(validation.error).toContain("melebihi batas 5MB");
        });

        it("NON-transcoded file over 5 MB is REJECTED", async () => {
          const rawPdf = {
            uri: "file:///documents/large_report.pdf",
            fileName: "large_report.pdf",
            mimeType: "application/pdf",
            fileSize: 6 * 1024 * 1024, // 6 MB
          };

          const resolved = await resolveTranscodedAsset(rawPdf, null, "doc-1");

          expect(resolved.isTranscoded).toBe(false);
          expect(resolved.size).toBe(6 * 1024 * 1024);

          const validation = validateEvidenceFile(
            {
              name: resolved.name,
              mimeType: resolved.mimeType,
              size: resolved.size,
              uri: resolved.uri,
            },
            "file"
          );
          expect(validation.valid).toBe(false);
          expect(validation.error).toContain("melebihi batas 5MB");
        });

        it("unknown-size path behaves exactly as documented: allows attempt through to authoritative server gate", async () => {
          // Simulate getLocalFileSize failing (returns null) for transcoded photo with rawSize > 5MB
          jest.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
            Promise.reject(new Error("Local file fetch not supported on this platform"))
          );

          const rawAsset = {
            uri: "ph://photo-unknown-size",
            fileName: "field_photo.jpg",
            mimeType: "image/jpeg",
            fileSize: 8 * 1024 * 1024, // 8 MB raw
          };

          const resolved = await resolveTranscodedAsset(
            rawAsset,
            "file:///cache/transcoded_unknown.jpg",
            "camera-unk"
          );

          expect(resolved.isTranscoded).toBe(true);
          // Neither size is knowable -> size is null (must not use rawSize 8MB as veto)
          expect(resolved.size).toBeNull();

          // Allowed through on client to authoritative server-side check (OD-4 / NFR-07)
          const validation = validateEvidenceFile(
            {
              name: resolved.name,
              mimeType: resolved.mimeType,
              size: resolved.size,
              uri: resolved.uri,
            },
            "photo"
          );
          expect(validation.valid).toBe(true);

          // Also test non-transcoded asset with unknown size (null)
          const rawUnknownDoc = {
            uri: "content://picker/doc.pdf",
            fileName: "doc.pdf",
            mimeType: "application/pdf",
            fileSize: null,
          };
          const resolvedDoc = await resolveTranscodedAsset(rawUnknownDoc, null, "doc-unk");
          expect(resolvedDoc.size).toBeNull();
          const docValidation = validateEvidenceFile(
            {
              name: resolvedDoc.name,
              mimeType: resolvedDoc.mimeType,
              size: resolvedDoc.size,
              uri: resolvedDoc.uri,
            },
            "file"
          );
          expect(docValidation.valid).toBe(true);
        });

        it("transcoded file with failed local measurement uses rawSize as conservative signal when rawSize <= 5MB", async () => {
          jest.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
            Promise.reject(new Error("Network/file error"))
          );

          const rawAsset = {
            uri: "ph://photo-small",
            fileName: "small.jpg",
            mimeType: "image/jpeg",
            fileSize: 2 * 1024 * 1024, // 2 MB raw <= 5 MB
          };

          const resolved = await resolveTranscodedAsset(
            rawAsset,
            "file:///cache/small_transcoded.jpg",
            "small-1"
          );

          expect(resolved.isTranscoded).toBe(true);
          expect(resolved.size).toBe(2 * 1024 * 1024);

          const validation = validateEvidenceFile(
            {
              name: resolved.name,
              mimeType: resolved.mimeType,
              size: resolved.size,
              uri: resolved.uri,
            },
            "photo"
          );
          expect(validation.valid).toBe(true);
        });
      });
    });

    describe("getAttachedFiles backwards compatibility & multi-evidence resolution", () => {
      it("resolves multi-item evidence_files correctly", () => {
        const state: IItemState = {
          daily_routine_item_id: "item-1",
          is_checked: true,
          evidence_file: "/uploads/first.jpg",
          evidence_files: [
            { id: "1", file: "/uploads/first.jpg", name: "first.jpg" },
            { id: "2", file: "/uploads/second.png", name: "second.png" },
          ],
          notes: "",
          local_uri: null,
        };

        const attached = getAttachedFiles(state);
        expect(attached).toHaveLength(2);
        expect(attached[0].file).toBe("/uploads/first.jpg");
        expect(attached[1].file).toBe("/uploads/second.png");
      });

      it("falls back to legacy single string evidence_file", () => {
        const state: IItemState = {
          daily_routine_item_id: "item-1",
          is_checked: true,
          evidence_file: "/uploads/legacy.jpg",
          notes: "",
          local_uri: null,
        };

        const attached = getAttachedFiles(state);
        expect(attached).toHaveLength(1);
        expect(attached[0].file).toBe("/uploads/legacy.jpg");
        expect(attached[0].name).toBe("legacy.jpg");
      });

      it("falls back to local_uri if upload is pending or failed", () => {
        const state: IItemState = {
          daily_routine_item_id: "item-1",
          is_checked: true,
          evidence_file: null,
          local_uri: "file:///data/cache/temp.jpg",
          upload_failed: true,
          notes: "",
        };

        const attached = getAttachedFiles(state);
        expect(attached).toHaveLength(1);
        expect(attached[0].local_uri).toBe("file:///data/cache/temp.jpg");
        expect(attached[0].upload_failed).toBe(true);
      });

      it("returns empty array if no evidence is attached", () => {
        const state: IItemState = {
          daily_routine_item_id: "item-1",
          is_checked: false,
          evidence_file: null,
          evidence_files: [],
          local_uri: null,
          notes: "",
        };

        expect(getAttachedFiles(state)).toEqual([]);
      });
    });
  });

  describe("Task B: Timezone Standardization & Audit (OD-5)", () => {
    const wallClockTime = "2026-09-11 08:30:00";
    const expectedUtcTimestamp = Date.UTC(2026, 8, 11, 1, 30, 0); // 08:30 WIB is 01:30 UTC

    it("parseWIBDate maps wall-clock string to exact WIB offset (+07:00)", () => {
      const parsed = parseWIBDate(wallClockTime);
      expect(parsed).not.toBeNull();
      expect(parsed!.getTime()).toBe(expectedUtcTimestamp);
    });

    it("parseWIBDate handles YYYY-MM-DD string mapped to 00:00:00 WIB", () => {
      const parsed = parseWIBDate("2026-09-11");
      expect(parsed).not.toBeNull();
      expect(parsed!.getTime()).toBe(Date.UTC(2026, 8, 10, 17, 0, 0)); // 00:00 WIB is 17:00 UTC previous day
    });

    it("getWIBHour extracts hour in WIB regardless of environment", () => {
      const d = parseWIBDate("2026-09-11 08:30:00")!;
      expect(getWIBHour(d)).toBe(8);

      const night = parseWIBDate("2026-09-11 23:45:00")!;
      expect(getWIBHour(night)).toBe(23);

      const morning = parseWIBDate("2026-09-11 00:15:00")!;
      expect(getWIBHour(morning)).toBe(0);
    });

    it("buildWIBScheduledTime constructs Date pinned to WIB", () => {
      const base = parseWIBDate("2026-09-11 08:00:00")!;
      const scheduled = buildWIBScheduledTime(base, 17, 0);
      expect(getWIBHour(scheduled)).toBe(17);
      expect(scheduled.getTime()).toBe(Date.UTC(2026, 8, 11, 10, 0, 0));
    });

    it("formatDate formats in Asia/Jakarta canonically", () => {
      expect(formatDate(wallClockTime)).toBe("11 Sep 2026");
      expect(formatDate(wallClockTime, "DD MMM YYYY")).toBe("11 Sep 2026");
      expect(formatDate(wallClockTime, "YYYY-MM-DD")).toBe("2026-09-11");
    });

    it("formatDateTime formats in Asia/Jakarta canonically", () => {
      expect(formatDateTime(wallClockTime)).toContain("11 Sep 2026");
      expect(formatDateTime(wallClockTime)).toMatch(/08[.:]30/);
      expect(
        formatDateTime(wallClockTime, { hour: "2-digit", minute: "2-digit" })
      ).toMatch(/08[.:]30/);
    });

    it("formatDDMMM in RoutineProgressCard formats in Asia/Jakarta canonically", () => {
      expect(formatDDMMM("2026-09-11 08:30:00")).toBe("11 Sep");
      expect(formatDDMMM("2026-09-11")).toBe("11 Sep");
    });

    it("todayWIB returns valid YYYY-MM-DD date string", () => {
      const today = todayWIB();
      expect(typeof today).toBe("string");
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("Task C / Defect Fixes: Fail-Safe Policy & Upload Payload (OD-4)", () => {
    describe("resolveEvidenceType fail-safe and backward compatibility", () => {
      it("an unrecognised value resolves to 'photo'", () => {
        expect(resolveEvidenceType("unknown")).toBe("photo");
        expect(resolveEvidenceType("document")).toBe("photo");
        expect(resolveEvidenceType("garbage")).toBe("photo");
        expect(resolveEvidenceType("")).toBe("photo");
        expect(resolveEvidenceType("invalid_type")).toBe("photo");
      });

      it("explicit 'none' still means no-evidence-required", () => {
        expect(resolveEvidenceType("none")).toBe("none");
        expect(resolveEvidenceType("none", true)).toBe("none");
        expect(resolveEvidenceType("none", false)).toBe("none");
      });

      it("absent value with is_photo_required: true -> 'photo' and with false -> 'none'", () => {
        expect(resolveEvidenceType(undefined, true)).toBe("photo");
        expect(resolveEvidenceType(undefined, false)).toBe("none");
        expect(resolveEvidenceType(null, true)).toBe("photo");
        expect(resolveEvidenceType(null, false)).toBe("none");
        expect(resolveEvidenceType(undefined, undefined)).toBe("none");
      });

      it("explicit 'file' still accepts PDF mode and legal types are preserved", () => {
        expect(resolveEvidenceType("file")).toBe("file");
        expect(resolveEvidenceType("photo")).toBe("photo");
        expect(resolveEvidenceType("both")).toBe("both");
      });
    });

    describe("validateEvidenceFile policy enforcement under all modes", () => {
      const validJpg = { name: "foto.jpg", mimeType: "image/jpeg", size: 1024 * 1024 };
      const validPdf = { name: "berkas.pdf", mimeType: "application/pdf", size: 1024 * 1024 };
      const svgFile = { name: "vektor.svg", mimeType: "image/svg+xml", size: 10 * 1024 };

      it("an unrecognised value resolves to 'photo' and rejects PDF", () => {
        const resUnknown = validateEvidenceFile(validPdf, "unknown");
        expect(resUnknown.valid).toBe(false);
        expect(resUnknown.error).toContain("hanya menerima bukti foto (JPG, PNG, WEBP)");

        const resDoc = validateEvidenceFile(validPdf, "document");
        expect(resDoc.valid).toBe(false);
        expect(resDoc.error).toContain("hanya menerima bukti foto (JPG, PNG, WEBP)");

        // Valid image passes for unrecognised mode as it fails safe to photo
        expect(validateEvidenceFile(validJpg, "unknown").valid).toBe(true);
        expect(validateEvidenceFile(validJpg, "document").valid).toBe(true);
      });

      it("explicit 'none' still means no-evidence-required", () => {
        const res = validateEvidenceFile(validJpg, "none");
        expect(res.valid).toBe(false);
        expect(res.error).toContain("tidak memerlukan bukti");
      });

      it("absent value with is_photo_required: true -> 'photo' and with false -> 'none'", () => {
        // is_photo_required: true -> photo only, rejects PDF, accepts photo
        const resPdfTrue = validateEvidenceFile(validPdf, undefined, true);
        expect(resPdfTrue.valid).toBe(false);
        expect(resPdfTrue.error).toContain("hanya menerima bukti foto (JPG, PNG, WEBP)");

        const resJpgTrue = validateEvidenceFile(validJpg, undefined, true);
        expect(resJpgTrue.valid).toBe(true);

        // is_photo_required: false -> none, rejects upload outright
        const resFalse = validateEvidenceFile(validJpg, undefined, false);
        expect(resFalse.valid).toBe(false);
        expect(resFalse.error).toContain("tidak memerlukan bukti");
      });

      it("explicit 'file' still accepts PDF", () => {
        const resPdf = validateEvidenceFile(validPdf, "file");
        expect(resPdf.valid).toBe(true);

        const resJpg = validateEvidenceFile(validJpg, "file");
        expect(resJpg.valid).toBe(true);
      });

      it("SVG rejected in every mode", () => {
        const modes = ["photo", "both", "file", "none", "unknown", "document", "garbage"];
        for (const mode of modes) {
          const res = validateEvidenceFile(svgFile, mode);
          expect(res.valid).toBe(false);
          expect(res.error).toContain("Format berkas SVG tidak didukung");
        }
      });
    });

    describe("uploadDailyRoutineTemp upload payload carries legal evidence_type", () => {
      let postSpy: jest.SpyInstance;

      beforeEach(() => {
        postSpy = jest.spyOn(axios, "post").mockResolvedValue({
          data: {
            data: [{ path: "/uploads/evidence-1.jpg", link: "https://s3.pelindo.co.id/evidence-1.jpg" }],
          },
        });
      });

      afterEach(() => {
        postSpy.mockRestore();
      });

      const extractFormDataField = (formData: any, key: string) => {
        if (typeof formData.get === "function") {
          return formData.get(key);
        }
        if (Array.isArray(formData._parts)) {
          const part = formData._parts.find((p: any) => p[0] === key);
          return part ? part[1] : undefined;
        }
        return undefined;
      };

      it("asserts upload payload carries legal 'file' for document items", async () => {
        const dummyFile = { uri: "file:///storage/doc.pdf", name: "doc.pdf", type: "application/pdf" };
        await uploadDailyRoutineTemp(dummyFile, "file");

        expect(postSpy).toHaveBeenCalledTimes(1);
        const [url, formData, config] = postSpy.mock.calls[0];
        expect(url).toBe("/daily-routine/upload");
        expect(config?.headers?.["Content-Type"]).toBe("multipart/form-data");
        expect(extractFormDataField(formData, "evidence_type")).toBe("file");
      });

      it("asserts upload payload carries legal 'photo' for photo items", async () => {
        const dummyFile = { uri: "file:///storage/photo.jpg", name: "photo.jpg", type: "image/jpeg" };
        await uploadDailyRoutineTemp(dummyFile, "photo");

        const [, formData] = postSpy.mock.calls[0];
        expect(extractFormDataField(formData, "evidence_type")).toBe("photo");
      });

      it("asserts upload payload carries legal 'both' for both items", async () => {
        const dummyFile = { uri: "file:///storage/photo.jpg", name: "photo.jpg", type: "image/jpeg" };
        await uploadDailyRoutineTemp(dummyFile, "both");

        const [, formData] = postSpy.mock.calls[0];
        expect(extractFormDataField(formData, "evidence_type")).toBe("both");
      });

      it("asserts upload payload carries legal 'none' when none is provided", async () => {
        const dummyFile = { uri: "file:///storage/photo.jpg", name: "photo.jpg", type: "image/jpeg" };
        await uploadDailyRoutineTemp(dummyFile, "none");

        const [, formData] = postSpy.mock.calls[0];
        expect(extractFormDataField(formData, "evidence_type")).toBe("none");
      });

      it("asserts upload payload converts unrecognised 'document' to legal fail-safe 'photo'", async () => {
        const dummyFile = { uri: "file:///storage/photo.jpg", name: "photo.jpg", type: "image/jpeg" };
        await uploadDailyRoutineTemp(dummyFile, "document");

        const [, formData] = postSpy.mock.calls[0];
        expect(extractFormDataField(formData, "evidence_type")).toBe("photo");
        expect(extractFormDataField(formData, "evidence_type")).not.toBe("document");
      });

      it("asserts upload payload defaults to legal 'photo' when evidence_type is omitted", async () => {
        const dummyFile = { uri: "file:///storage/photo.jpg", name: "photo.jpg", type: "image/jpeg" };
        await uploadDailyRoutineTemp(dummyFile);

        const [, formData] = postSpy.mock.calls[0];
        expect(extractFormDataField(formData, "evidence_type")).toBe("photo");
      });
    });
  });
});
