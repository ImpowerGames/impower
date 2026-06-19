// Pure helpers for the DEV-ONLY same-origin game-preview reverse proxy in
// build.ts. Kept side-effect-free so they can be unit-tested without importing
// the build script itself (which runs serve()/the build pipeline on import).

/**
 * HTTP/1.1 hop-by-hop headers. They are connection-scoped and must NOT be
 * forwarded by a proxy; re-emitting them is also a hard error under HTTP/2
 * (ERR_HTTP2_INVALID_CONNECTION_HEADERS), which the dev server uses when the
 * https/ certs exist.
 */
export const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
]);

/**
 * Whether a request URL should be reverse-proxied to the player dev server.
 * A boundary match on `base` (e.g. "/__player") — so the exact base and any
 * path beneath it match, but a sibling path like "/__playerfoo" does NOT get
 * hijacked by a loose prefix.
 */
export const shouldProxyToPlayer = (
  url: string | undefined,
  base: string,
): boolean => !!url && (url === base || url.startsWith(base + "/"));

/**
 * A shallow copy of `headers` with hop-by-hop headers removed
 * (case-insensitive). Used before re-emitting the upstream response.
 */
export const stripHopByHopHeaders = <T>(
  headers: Record<string, T>,
): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      out[key] = value;
    }
  }
  return out;
};
