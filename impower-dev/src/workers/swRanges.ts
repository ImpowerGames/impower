/**
 * The response for a project file, honouring a single-range `Range` header.
 *
 * Split out of `sw.ts` so it can be tested, as `swCaches.ts` is. A media
 * element asks for byte ranges: `<video preload="metadata">` in the preview
 * reads the container's header and index without the rest of the file, and a
 * seek asks for the bytes at the new position. A 200 answer to a ranged
 * request streams the whole file instead.
 *
 * One range is served as 206 with its `Content-Range`. A range that starts at
 * or past the end of the file is 416. A header this does not parse, and a
 * request for several ranges, get the whole file, which RFC 9110 permits a
 * server to send for any range request.
 */
export const fileResponse = (
  file: Blob,
  rangeHeader: string | null,
  headers: Headers,
): Response => {
  const size = file.size;
  const range = parseByteRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    const out = new Headers(headers);
    out.set("Content-Range", `bytes */${size}`);
    out.delete("Content-Length");
    return new Response(null, { status: 416, headers: out });
  }
  if (!range) {
    const out = new Headers(headers);
    out.set("Content-Length", String(size));
    return new Response(file.stream(), { status: 200, headers: out });
  }
  const out = new Headers(headers);
  out.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  out.set("Content-Length", String(range.end - range.start + 1));
  return new Response(file.slice(range.start, range.end + 1).stream(), {
    status: 206,
    headers: out,
  });
};

/**
 * The inclusive byte range a `Range` header asks for in a file of `size`
 * bytes, `"unsatisfiable"` when no byte of the file is in it, or `undefined`
 * when the whole file should be sent: no header, a header that is not one
 * `bytes` range, or several ranges.
 */
export const parseByteRange = (
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | undefined => {
  if (!header) {
    return undefined;
  }
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!match) {
    return undefined;
  }
  const [, first, last] = match;
  if (!first && !last) {
    return undefined;
  }
  if (!first) {
    // A suffix: the last `last` bytes.
    const length = Number(last);
    if (length === 0 || size === 0) {
      return "unsatisfiable";
    }
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last ? Number(last) : Infinity;
  if (end < start) {
    return undefined;
  }
  if (start >= size) {
    return "unsatisfiable";
  }
  return { start, end: Math.min(end, size - 1) };
};
