import { expect, it, vi } from "vitest";
import { readHoverImages } from "../../src/modules/spark-editor/workspace/readHoverImages";

it("returns intrinsic image dimensions using the project's resolved asset", async () => {
  const resolve = vi.fn(async () => "blob:resolved");
  const create = () => {
    const image = document.createElement("img");
    Object.defineProperties(image, { naturalWidth: { value: 640 }, naturalHeight: { value: 480 }, src: { set() { queueMicrotask(() => image.dispatchEvent(new Event("load"))); } } });
    return image;
  };
  const hover = { contents: { kind: "markdown" as const, value: "![Portrait](file://local/assets/portrait.png)" } };
  const result = await readHoverImages(hover, resolve, create);
  expect(resolve).toHaveBeenCalledWith("file://local/assets/portrait.png");
  expect(result?.images).toEqual([{ src: "blob:resolved", naturalWidth: 640, naturalHeight: 480, loaded: true }]);
  expect(result?.contents).toEqual(hover.contents);
});
it("preserves null and does not interpret plain text as Markdown", async () => {
  expect(await readHoverImages(null, vi.fn())).toBeNull();
  const create = vi.fn();
  expect((await readHoverImages({ contents: { kind: "plaintext", value: "![x](https://example.com/x.png)" } }, vi.fn(), create))?.images).toEqual([]);
  expect(create).not.toHaveBeenCalled();
});
