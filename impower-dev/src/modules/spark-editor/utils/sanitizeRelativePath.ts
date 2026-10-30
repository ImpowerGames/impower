const SEGMENT_DISALLOWED = /[^\w\n\r.]/g;

const sanitizeSegment = (segment: string): string =>
  segment.replace(SEGMENT_DISALLOWED, "_");

export const sanitizeRelativePath = (input: string): string | null => {
  const segments = input.replace(/\\/g, "/").split("/");

  const cleaned: string[] = [];
  for (const rawSegment of segments) {
    if (rawSegment === "" || rawSegment === ".") {
      continue;
    }
    if (rawSegment === "..") {
      return null;
    }
    cleaned.push(sanitizeSegment(rawSegment));
  }

  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.join("/");
};

export default sanitizeRelativePath;
