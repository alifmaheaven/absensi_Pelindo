/**
 * Regression guard for the render-token URL shapes (SEC-01 client).
 *
 * WHY THIS EXISTS
 * ---------------
 * The first version of `lib/renderToken.ts` shipped TWO URL bugs that made every
 * image blank in the app (found in dev on 2026-09-16, reported by the user as
 * "modal attendance masih kosongan"):
 *
 *   1. MINT PATH double-prefix. It posted to `/api/v1/signed-url/render` while
 *      axios's `baseURL` ALREADY ends in `/api/v1`, producing
 *      `/api/v1/api/v1/signed-url/render` → 404. The request interceptor only
 *      rewrites `baseURL` for `/api/v2/` paths, so a `/api/v1/...` path is
 *      concatenated verbatim. The mint failed silently (the catch is deliberate
 *      so a mint failure never crashes a screen), so no token ever existed.
 *
 *   2. IMAGE PATH wrong segment. It string-concatenated `baseURL` with the file
 *      path, producing `/api/v1/public/images/<key>` → 404. Stored files are
 *      served by middleware mounted at APP level, i.e. the ROOT path
 *      `/public/images/<key>`. Verified live: `/public/images/...` → 403 (SEC-01
 *      active, correct route) while `/api/v1/public/images/...` → 404.
 *
 * Both are URL-shape bugs that unit-testing the cache logic alone would miss, so
 * these tests assert the exact strings a request would use.
 */

const FAKE_BASE = 'https://example.test/api/v1';
const mockPost = jest.fn().mockResolvedValue({
  data: { data: { urls: { 'files/a.jpg': '/public/images/files/a.jpg?token=abc123' }, expires_in: 300 } },
});

jest.mock('@/lib/axios', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockPost(...args) },
}));

jest.mock('@/constants', () => ({
  IMAGE_BASE_PATH: '/public/images/',
}));

import { ensureRenderTokens, fileUrl } from '../lib/renderToken';

describe('renderToken URL shapes (SEC-01 client)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = FAKE_BASE;
    mockPost.mockClear();
  });

  it('mints via a path WITHOUT a duplicated /api/v1 segment', async () => {
    await ensureRenderTokens(['files/a.jpg']);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url] = mockPost.mock.calls[0];
    // Must be the version-less path: axios joins it onto baseURL.
    expect(url).toBe('/signed-url/render');
    expect(url).not.toContain('/api/v1');
  });

  it('builds image URLs at the ROOT /public/images path, never under /api/v1', () => {
    // Use a key this suite never mints for, so the assertion is about the PATH
    // shape and not affected by the module-level token cache (which persists
    // across tests in the same file).
    const url = fileUrl('files/never-minted.jpg');

    expect(url).toContain('/public/images/files/never-minted.jpg');
    expect(url).not.toContain('/api/v1/public/images');
    expect(url).toBe('https://example.test/public/images/files/never-minted.jpg');
  });

  it('carries the token in the QUERY STRING once minted (so <Image> works)', async () => {
    await ensureRenderTokens(['files/a.jpg']);
    const url = fileUrl('files/a.jpg');

    expect(url).toContain('token=abc123');
    expect(url.startsWith('https://example.test/public/images/')).toBe(true);
  });

  it('never double-prefixes a key that already starts with public/images/', () => {
    const url = fileUrl('public/images/abc.jpg');

    expect(url).toContain('/public/images/abc.jpg');
    expect(url).not.toContain('/public/images/public/images/');
  });

  it('passes local device URIs through untouched (no token, no rewrite)', () => {
    expect(fileUrl('file:///data/user/0/app/cache/photo.jpg')).toBe(
      'file:///data/user/0/app/cache/photo.jpg',
    );
  });

  it('falls back to the bare URL when the mint failed, so rendering never blocks', async () => {
    mockPost.mockRejectedValueOnce(new Error('network down'));
    await ensureRenderTokens(['files/other.jpg']);

    const url = fileUrl('files/other.jpg');
    expect(url).toBe('https://example.test/public/images/files/other.jpg');
    expect(url).not.toContain('token=');
  });
});
