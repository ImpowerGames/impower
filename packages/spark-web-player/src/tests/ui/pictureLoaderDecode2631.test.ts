import { describe, expect, test } from "vitest";
import { browserPictureLoader } from "../../app/morph/MorphPlayback";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

type Paint = "pixels" | "nothing" | "tainted";

const documentWith = (image: { decodes: boolean; complete: boolean; width: number }, paint: Paint) => {
  const probes: unknown[] = [];
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
  const doc = {
    defaultView: { Image: FakeImage },
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (drawn: unknown) => probes.push(drawn),
        getImageData: (_x: number, _y: number, width: number, height: number) => {
          if (paint === "tainted") throw new DOMException("The canvas has been tainted.", "SecurityError");
          const data = new Uint8ClampedArray(width * height * 4);
          if (paint === "pixels") data[data.length - 1] = 12;
          return { data };
        },
      }),
    }),
  };
  return { doc: doc as unknown as Document, probes };
};

describe("a layer file whose up-front decode the browser refuses loads only when it paints (#2631)", () => {
  test("a loaded image that paints is used though decode() was refused, as Chromium refuses large images past its decode budget", async () => {
    const { doc, probes } = documentWith({ decodes: false, complete: true, width: 1 }, "pixels");
    const loaded = await browserPictureLoader(PNG, doc);
    expect(probes).toEqual([loaded?.image]);
    expect(loaded?.image).toBeInstanceOf(doc.defaultView!.Image);
    expect(loaded).toMatchObject({ width: 1, height: 1, animated: false, profile: false });
  });

  test("a corrupt file that reports a natural size but paints nothing loads nothing", async () => {
    expect(await browserPictureLoader(PNG, documentWith({ decodes: false, complete: true, width: 16160 }, "nothing").doc)).toBeUndefined();
  });

  test("a refused decode loads nothing where the painted pixels cannot be read", async () => {
    expect(await browserPictureLoader(PNG, documentWith({ decodes: false, complete: true, width: 1 }, "tainted").doc)).toBeUndefined();
  });

  test("a broken image, with no natural size, and an image not yet loaded load nothing", async () => {
    expect(await browserPictureLoader(PNG, documentWith({ decodes: false, complete: true, width: 0 }, "pixels").doc)).toBeUndefined();
    expect(await browserPictureLoader(PNG, documentWith({ decodes: false, complete: false, width: 1 }, "pixels").doc)).toBeUndefined();
  });

  test("a decoded image loads without a paint probe", async () => {
    const { doc, probes } = documentWith({ decodes: true, complete: true, width: 1 }, "nothing");
    expect(await browserPictureLoader(PNG, doc)).toMatchObject({ width: 1 });
    expect(probes).toHaveLength(0);
  });
});
