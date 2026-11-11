export const RESOURCE_PROTOCOL = "/file:/";

const RESOURCE_URL_BASE = "https://sparkdown.invalid";

const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const getResourceSrcFromPath = (path: string): string =>
  RESOURCE_PROTOCOL + path.split("/").map(encodeURIComponent).join("/");

export const getResourcePathFromUrl = (url: URL | string): string => {
  const pathname =
    typeof url === "string" ? new URL(url, RESOURCE_URL_BASE).pathname : url.pathname;
  const encodedPath = pathname.startsWith(RESOURCE_PROTOCOL)
    ? pathname.slice(RESOURCE_PROTOCOL.length)
    : pathname;
  return encodedPath.split("/").map(decodeSegment).join("/");
};
