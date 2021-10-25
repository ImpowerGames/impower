export const getUrl = (
  query?: Record<string, string | number | boolean>
): string => {
  const querySuffix = Object.entries(query || {})
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  if (!querySuffix) {
    return window.location.pathname;
  }
  return `${window.location.pathname}?${querySuffix}`;
};
