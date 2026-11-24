import { describe, expect, test } from "vitest";
import { browserPictureLoader } from "../../app/morph/MorphPlayback";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const documentWith = (image: { decodes: boolean; complete: boolean; width: number }) => {
  class FakeImage {
    decoding = "";
    src = "";
    complete = image.complete;
    naturalWidth = image.width;
    naturalHeight = image.width;
    decode() {
      return image.decodes ? Promise.resolve() : Promise.reject(new DOMException("The source image cannot be decoded.", "EncodingError"));
    }
  }
  return { defaultView: { Image: FakeImage } } as unknown as Document;
};

describe("a layer file whose up-front decode the browser refuses still loads when the image did (#2631)", () => {
  test("a loaded image with its natural size is used though decode() was refused, as Chromium refuses large images past its decode budget", async () => {
    const loaded = await browserPictureLoader(PNG, documentWith({ decodes: false, complete: true, width: 1 }));
    expect(loaded).toMatchObject({ width: 1, height: 1, animated: false, profile: false });
  });

  test("a broken image, with no natural size, loads nothing", async () => {
    expect(await browserPictureLoader(PNG, documentWith({ decodes: false, complete: true, width: 0 }))).toBeUndefined();
  });

  test("an image that has not loaded when decode() is refused loads nothing", async () => {
    expect(await browserPictureLoader(PNG, documentWith({ decodes: false, complete: false, width: 1 }))).toBeUndefined();
  });

  test("a decoded image loads as before", async () => {
    expect(await browserPictureLoader(PNG, documentWith({ decodes: true, complete: true, width: 1 }))).toMatchObject({ width: 1 });
  });
});
