import { describe, expect, test } from "vitest";
import { IMAGE_HEADER_BYTES, imageSizeOf } from "../../src/workspace/utils/imageSize";
import { EXIF_BEFORE_IMAGE_DATA, imageSizeFixtures } from "./imageSizeFixtures";

const fixtures = imageSizeFixtures();
const readOf = (bytes: Uint8Array) => imageSizeOf(bytes.subarray(0, IMAGE_HEADER_BYTES)) ?? null;

describe("the size read from a picture's header is the size the browser decodes, or none (#2630)", () => {
  test.each(fixtures.map((fixture) => [fixture.name, fixture] as const))("%s", (_name, fixture) => {
    expect(readOf(fixture.bytes)).toEqual(fixture.read);
  });

  test("wherever the reader gives a size, it is the size the browser decodes", () => {
    const wrong = fixtures.filter((fixture) => {
      const read = readOf(fixture.bytes);
      return read !== null && JSON.stringify(read) !== JSON.stringify(fixture.decoded);
    });
    expect(wrong.map((fixture) => fixture.name)).toEqual([]);
  });

  test("no JPEG or PNG carrying an Exif block before its image data gets a size", () => {
    expect([...EXIF_BEFORE_IMAGE_DATA].filter((name) => !fixtures.some((fixture) => fixture.name === name))).toEqual([]);
    const sized = fixtures.filter((fixture) => fixture.exif && readOf(fixture.bytes) !== null);
    expect(sized.map((fixture) => fixture.name)).toEqual([]);
    expect(fixtures.filter((fixture) => fixture.exif).length).toBe(EXIF_BEFORE_IMAGE_DATA.size);
  });
});
