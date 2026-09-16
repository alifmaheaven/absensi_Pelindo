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

function baseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

/** Extract the object key from a bare URL or a raw key. Returns null if not a server key. */
export function extractFileKey(uriOrKey: string): string | null {
  if (!uriOrKey) return null;
  if (/^(https?:\/\/|file:\/\/|content:\/\/)/i.test(uriOrKey)) {
    const marker = "/public/images/";
    const idx = uriOrKey.indexOf(marker);
    return idx >= 0 ? uriOrKey.slice(idx + marker.length) : null;
  }
  return uriOrKey.startsWith("/") ? uriOrKey.slice(1) : uriOrKey;
}

/**
 * Mint render tokens for every key that does not yet have a live one.
 * One batched POST for the whole page load. Errors are swallowed: a failed mint
 * leaves `fileUrl` returning the bare URL (the pre-SEC-01 behaviour), which the
 * server will 403 — the same outcome as before this module existed, and the
 * next effect retry can mint again.
 */
export async function ensureRenderTokens(keys: Array<string | null | undefined>): Promise<void> {
  const wanted = keys
    .map((k) => (k ? extractFileKey(k) : null))
    .filter((k): k is string => !!k && !cache.has(k));

  if (wanted.length === 0) return;
  if (wanted.some((k) => inFlight.has(k))) return;
  wanted.forEach((k) => inFlight.add(k));

  try {
    // Lazy import avoids a static cycle: some components import this module and
    // also the axios instance that reads the auth store.
    const { default: axios } = await import("@/lib/axios");
    const res = await axios.post("/api/v1/signed-url/render", { keys: wanted });
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
  const key = extractFileKey(fullUrl);
  if (!key) return fullUrl;
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return fullUrl;
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

  const entry = cache.get(key);
  const base = baseUrl();

  // Preserve the original per-screen semantics exactly: a key that already
  // carries the public/images/ segment maps to `/<key>` and must NOT be
  // double-prefixed. (Caught by the existing modal test
  // "handles keys already starting with public/images/" — the pre-fix code
  // produced `/public/images/public/images/abc.jpg`.)
  const path = key.startsWith("public/images/") ? `/${key}` : `${IMAGE_BASE_PATH}${key}`;
  const url = base ? `${base}${path}` : path;

  if (!entry || entry.expiresAt <= Date.now()) return url;
  return `${url}?token=${encodeURIComponent(entry.token)}`;
}