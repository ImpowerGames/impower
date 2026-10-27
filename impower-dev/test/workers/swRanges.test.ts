// @vitest-environment node
// How the project-file service worker answers a `Range` request.
//
// The preview's `<video preload="metadata">` asks for the bytes it needs to
// show a first frame, and a seek asks for the bytes at the new position. The
// worker advertises `Accept-Ranges: bytes`, so a ranged request has to come
// back as 206 with exactly the requested bytes.

import { describe, expect, it } from "vitest";
import { fileResponse, parseByteRange } from "../../src/workers/swRanges";

const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
const file = new Blob([bytes], { type: "video/webm" });
const baseHeaders = () =>
  new Headers({
    "Content-Type": "video/webm",
    "Content-Length": String(bytes.length),
    "Accept-Ranges": "bytes",
  });

const body = async (response: Response) =>
  Array.from(new Uint8Array(await response.arrayBuffer()));

describe("project-file range responses", () => {
  it("answers a ranged request with 206 and only the requested bytes", async () => {
    const response = fileResponse(file, "bytes=10-19", baseHeaders());
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 10-19/100");
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.headers.get("Content-Type")).toBe("video/webm");
    expect(await body(response)).toEqual(Array.from(bytes.slice(10, 20)));
  });

  it("answers an open-ended range with the rest of the file", async () => {
    const response = fileResponse(file, "bytes=90-", baseHeaders());
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 90-99/100");
    expect(await body(response)).toEqual(Array.from(bytes.slice(90)));
  });

  it("answers the first media request, bytes=0-, with the whole file as 206", async () => {
    const response = fileResponse(file, "bytes=0-", baseHeaders());
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-99/100");
    expect(response.headers.get("Content-Length")).toBe("100");
    expect(await body(response)).toEqual(Array.from(bytes));
  });

  it("answers a suffix range with the last bytes", async () => {
    const response = fileResponse(file, "bytes=-5", baseHeaders());
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 95-99/100");
    expect(await body(response)).toEqual(Array.from(bytes.slice(95)));
  });

  it("clamps a range that runs past the end", async () => {
    const response = fileResponse(file, "bytes=98-500", baseHeaders());
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 98-99/100");
    expect(await body(response)).toEqual([98, 99]);
  });

  it("answers 416 for a range that starts past the end", async () => {
    const response = fileResponse(file, "bytes=100-", baseHeaders());
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */100");
    expect(await body(response)).toEqual([]);
  });

  it("sends the whole file with 200 when there is no Range header", async () => {
    const response = fileResponse(file, null, baseHeaders());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(response.headers.get("Content-Length")).toBe("100");
    expect(await body(response)).toEqual(Array.from(bytes));
  });

  it("sends the whole file for several ranges or an unreadable header", async () => {
    for (const header of ["bytes=0-1,5-6", "items=0-5", "bytes=9-3", "bytes=-"]) {
      const response = fileResponse(file, header, baseHeaders());
      expect(response.status, header).toBe(200);
      expect((await body(response)).length, header).toBe(100);
    }
  });

  it("treats a zero-length suffix and any range of an empty file as unsatisfiable", () => {
    expect(parseByteRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-", 0)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-10", 0)).toBe("unsatisfiable");
  });
});
