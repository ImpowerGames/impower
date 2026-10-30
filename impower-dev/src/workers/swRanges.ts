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
