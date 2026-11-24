// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { getImagePreviewComposited, type ImageCompositeOptions } from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { shownImageLayers } from "@impower/sparkdown/src/morph/channel";
import { describe, expect, it } from "vitest";
import { getVariantPicture } from "../../utils/providers/getVariantPicture";

const MAIN = "file:///project/main.sd";

const morph = (from: string, to: string) => `morph lid_rest {
  blend = cut
  keyframes {
    from {
      lids {
        state = ${from}
      }
    }
    to {
      lids {
        state = ${to}
      }
    }
  }
}
`;

const compile = (overlayKey: string, from: string, to: string) => {
  const compiler = new SparkdownCompiler();
  const text = `${morph(from, to)}\ndefine kit as layered_image with\n  assets = {\n    ["${overlayKey}"] = overlay,\n  }\nend\n\nscene start\n  [[kit]]\nend\n`;
  compiler.configure({
    files: [
      { uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
      { uri: "file:///project/overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png", version: 1 },
    ] as never,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program!;
  const options: ImageCompositeOptions = {
    shownLayers: (context, struct, pick) => shownImageLayers(context, program.morphs, struct, undefined, pick),
  };
  return { context: program.context!, options };
};

describe("previews of a picture whose look and rest differ in being empty (#2629)", () => {
  it("a hover shows nothing when the morph's rest hides the picture's only layer", async () => {
    const { context, options } = compile("lids.on default", "on", "off");
    const kit = context["layered_image"]!["kit"];
    expect(await getImagePreviewComposited(context, kit, options)).toBeUndefined();
    expect(await getVariantPicture(context, { image: "kit", attributes: [] }, options)).toEqual({ src: "", layers: [] });
  });

  it("the Variants tester shows the layer the morph's rest turns on when the look without it is empty", async () => {
    const { context, options } = compile("lids.on", "off", "on");
    expect(await getVariantPicture(context, { image: "kit", attributes: [] }, options)).toEqual({
      src: "/src/overlay.png",
      layers: ["file:///project/overlay.png"],
    });
  });

  it("without a morph, an empty look still previews as before", async () => {
    const { context } = compile("lids.on", "off", "on");
    expect(await getVariantPicture(context, { image: "kit", attributes: [] })).toEqual({ src: "", layers: [] });
  });
});
