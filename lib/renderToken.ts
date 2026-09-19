/**
 * Render-token client for stored files (SEC-01 / OBS-V10).
 *
 * WHY THIS EXISTS
 * ---------------
 * With SEC-01 active, `/public/images/<key>` refuses any URL without a render
 * token minted by `POST /api/v1/signed-url/render`. Image components render
 * through `<img src>` / `expo-image`, which cannot carry an Authorization
 * header — so the token must travel in the QUERY STRING.
 *
 * The released clients built bare URLs, which is why enabling SEC-01 broke every
 * evidence thumbnail, gallery photo and company logo. This module gives the
 * mobile client a single, cached way to mint tokens and build working URLs.
 *
 * CONTRACT
 * --------
 *   ensureRenderTokens(keys)  — fire-and-forget batch mint (call from effects,
 *                               NEVER from render: React Compiler purity).
 *   fileUrl(keyOrUri)         — synchronous URL builder. Identical semantics to
 *                               the per-screen `resolveEvidenceUrl` helpers it
 *                               replaces, plus `?token=` when a token is cached.
 *   useRenderTokenVersion()   — subscribe to the cache; call in the component
 *                               body so it re-renders when tokens arrive.
 *
 * GRACEFUL DEGRADATION: with no token cached, `fileUrl` returns the bare URL —
 * the same URL the app built before SEC-01. So a component never blocks on the
 * network to render; the image simply appears when the token lands and the
 * store version bumps re-render.
 */

import { create } from "zustand";
import { IMAGE_BASE_PATH } from "@/constants";
import api from "@/lib/axios";

type TokenEntry = { token: string; expiresAt: number };

/** key (e.g. "files/attendance/x.jpg") -> token + expiry epoch ms. */
const cache = new Map<string, TokenEntry>();

/** Keys with a mint already in flight — prevents duplicate batch calls. */
const inFlight = new Set<string>();

type RenderTokenState = {
  /** Bumped on every cache write so subscribers re-render. */
  version: number;
  bump: () => void;
};

const useStore = create<RenderTokenState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

/**
 * Subscribe to token-cache changes. Call this in the component BODY (never in a
 * loop or inside a resolve helper): when tokens arrive the version changes and
 * the component re-renders, at which point `fileUrl()` picks up the token.
 */
export function useRenderTokenVersion(): number {
  return useStore((s) => s.version);
}

/**
 * API base including the version segment — e.g. `https://host/api/v1`.
 * Used for API calls (axios joins `baseURL` + path).
 */
function baseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

/**
 * ORIGIN of the API host, WITHOUT the `/api/v1` segment — e.g. `https://host`.
 *
 * WHY THIS EXISTS (bug found in dev, 2026-09-16): stored files are served by
 * `r2RedirectMiddleware`, which is mounted at APP level — i.e. at the ROOT path
 * `/public/images/<key>`, NOT under `/api/v1`. String-concatenating `baseUrl`
 * with the image path produced `https://host/api/v1/public/images/<key>`, which
 * is a 404 (verified live), so every image stayed blank even after a token was
 * minted. The pre-existing per-screen helpers used `new URL(path, BASE_URL)`,
 * where a leading `/` correctly resolves against the ORIGIN — that is the
 * behaviour this restores.
 */
function originUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/api\/v\d+\/?$/, "").replace(/\/+$/, "");
}

/** Extract the object key from a bare URL or a raw key. Returns null if not a server key. */
export function extractFileKey(uriOrKey: string): string | null {
  if (!uriOrKey) return null;
  if (/^(https?:\/\/|file:\/\/|content:\/\/)/i.test(uriOrKey)) {
    const marker = "/public/images/";
    const idx = uriOrKey.indexOf(marker);
    // M-08: buang `?query`/`#fragment` — key cache TIDAK boleh mengandung token
    // lama (paritas web imageToken.js:62 `split(/[?#]/)`; tanpa ini, URL
    // ber-token menghasilkan key "files/a.jpg?token=…" yang tak pernah match
    // dengan entri cache manapun).
    return idx >= 0 ? uriOrKey.slice(idx + marker.length).split(/[?#]/)[0] : null;
  }
  const raw = uriOrKey.startsWith("/") ? uriOrKey.slice(1) : uriOrKey;
  return raw.split(/[?#]/)[0];
}

/**
 * M-08 (UIUX r2, 2026-09-19): KESGARAN, bukan keberadaan.
 * Entri kedaluwarsa dipurge-on-sight supaya:
 *   1. `ensureRenderTokens` me-mint ulang token basi (bug lama: `!cache.has(k)`
 *      membuat sesi > TTL → url polos → 403 → gambar BLANK PERMANEN s/d
 *      restart app, padahal server hanya TTL 300 dtk);
 *   2. Map tidak menumpuk entri mati tanpa batas.
 */
function isFresh(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  if (entry.expiresAt > Date.now()) return true;
  cache.delete(key);
  return false;
}

/**
 * Mint render tokens for every key that does not yet have a LIVE (unexpired)
 * one. One batched POST for the whole page load. Errors are swallowed: a failed
 * mint leaves `fileUrl` returning the bare URL (the pre-SEC-01 behaviour),
 * which the server will 403 — and the next effect retry re-mints, because
 * expired entries are purged and re-requested (M-08), never trusted by
 * presence.
 */
export async function ensureRenderTokens(keys: Array<string | null | undefined>): Promise<void> {
  const wanted = [
    ...new Set(
      keys
        .map((k) => (k ? extractFileKey(k) : null))
        .filter((k): k is string => !!k)
        .filter((k) => !isFresh(k)),
    ),
  ];

  if (wanted.length === 0) return;
  if (wanted.some((k) => inFlight.has(k))) return;
  wanted.forEach((k) => inFlight.add(k));

  try {
    // Path TANPA prefix /api/v1: baseURL sudah memuatnya. Memakai
    // "/api/v1/signed-url/render" menghasilkan /api/v1/api/v1/... (404) karena
    // request interceptor hanya me-rewrite baseURL untuk path /api/v2/. Itu
    // membuat mint selalu gagal senyap -> token tak pernah ada -> gambar kosong.
    const res = await api.post("/signed-url/render", { keys: wanted });
    const urls: Record<string, string> = res.data?.data?.urls ?? {};
    const expiresIn: number = res.data?.data?.expires_in ?? 300;
    const now = Date.now();
    for (const [key, url] of Object.entries(urls)) {
      const match = /[?&]token=([^&]+)/.exec(url);
      if (!match) continue;
      // Expire slightly early so we never render with a token the server rejects.
      cache.set(key, { token: decodeURIComponent(match[1]), expiresAt: now + (expiresIn - 15) * 1000 });
    }
    useStore.getState().bump();
  } catch {
    // Mint failure is non-fatal: images fall back to bare URLs (which are 403
    // under SEC-01) and the caller can retry. Do not crash the screen for it.
  } finally {
    wanted.forEach((k) => inFlight.delete(k));
  }
}

/**
 * Append the cached render token to an already-built full URL.
 * Falls back to the URL unchanged when no token is cached — never blocks.
 */
export function appendRenderToken(fullUrl: string): string {
  if (!fullUrl) return fullUrl;
  // M-08 paritas web imageToken.js:135: URL yang sudah membawa token tidak
  // boleh dapat token kedua (extractFileKey kini membuang query, sehingga
  // tanpa guard ini pemanggilan ganda menghasilkan ?token=A&token=B).
  if (/[?&]token=/.test(fullUrl)) return fullUrl;
  const key = extractFileKey(fullUrl);
  if (!key) return fullUrl;
  const entry = isFresh(key) ? cache.get(key) : undefined;
  if (!entry) return fullUrl;
  const sep = fullUrl.includes("?") ? "&" : "?";
  return `${fullUrl}${sep}token=${encodeURIComponent(entry.token)}`;
}

/**
 * Build the display URL for a stored file, appending the render token when one
 * is cached. Falls back to the pre-SEC-01 bare URL so rendering never blocks.
 */
export function fileUrl(uriOrKey: string): string {
  if (!uriOrKey) return "";
  if (/^(https?:\/\/|file:\/\/|content:\/\/)/i.test(uriOrKey) && !uriOrKey.includes("/public/images/")) {
    return uriOrKey;
  }

  const key = extractFileKey(uriOrKey);
  if (!key) return uriOrKey;

  // isFresh (bukan cache.get polos): entri expired dibuang di sini, bukan
  // dipakai diam-diam maupun diblokir diam-diam — pastikan mint ulang datang
  // dari pemanggil effect (kontrak modul: jangan ensure() dari render).
  const entry = isFresh(key) ? cache.get(key) : undefined;
  const base = originUrl();

  // Preserve the original per-screen semantics exactly: a key that already
  // carries the public/images/ segment maps to `/<key>` and must NOT be
  // double-prefixed. (Caught by the existing modal test
  // "handles keys already starting with public/images/" — the pre-fix code
  // produced `/public/images/public/images/abc.jpg`.)
  const path = key.startsWith("public/images/") ? `/${key}` : `${IMAGE_BASE_PATH}${key}`;
  const url = base ? `${base}${path}` : path;

  if (!entry) return url;
  return `${url}?token=${encodeURIComponent(entry.token)}`;
}