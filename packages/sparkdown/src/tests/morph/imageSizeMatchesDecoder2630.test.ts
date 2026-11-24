import { describe, expect, test } from "vitest";
import { IMAGE_HEADER_BYTES, imageSizeOf } from "../../workspace/utils/imageSize";
import { imageSizeFixtures } from "./imageSizeFixtures";

const fixtures = imageSizeFixtures();

describe("the size read from a picture's header is the size the browser decodes, or none (#2630)", () => {
  test.each(fixtures.map((fixture) => [fixture.name, fixture] as const))("%s", (_name, fixture) => {
    const read = imageSizeOf(fixture.bytes.subarray(0, IMAGE_HEADER_BYTES)) ?? null;
    expect(read).toEqual(fixture.read);
    if (read) expect(read).toEqual(fixture.decoded);
  });

  test("every fixture the reader gives no size is one it cannot settle from its first 64 KiB, or one the browser cannot decode", () => {
    const unread = fixtures.filter((fixture) => fixture.read === null).map((fixture) => [fixture.name, fixture.bytes.length > IMAGE_HEADER_BYTES || fixture.decoded === null]);
    expect(unread.every(([, settled]) => settled)).toBe(true);
  });
});
