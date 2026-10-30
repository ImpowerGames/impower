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

export const shouldProxyToPlayer = (
  url: string | undefined,
  base: string,
): boolean => !!url && (url === base || url.startsWith(base + "/"));

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
