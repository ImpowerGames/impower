export const getQuery = (url?: string): Record<string, string> => {
  const search = url ? url.slice(url.indexOf("?")) : window.location.search;
  const urlSearchParams = new URLSearchParams(search);
  const params = Object.fromEntries(urlSearchParams.entries());
  return params;
};
