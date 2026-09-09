import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const uri = "file://proj/main.sd";
const asset = (path: string): File => ({
  uri: `file://proj/assets/${path}`,
  type: "image",
  name: path.split("/").at(-1)!.split(".")[0]!,
  // Exercise the host's filename reader; dotted layer conditions must not be
  // mistaken for the extension before the compiler sees this file.
  ext: SparkdownWorkspace.prototype.getFileExtension(`file://proj/assets/${path}`),
  src: `/file:/local/assets/${path}?v=1`,
});
const compile = (text = "") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
    asset("background.png"),
    asset("mia/90_body.png"),
    asset("mia/30_face.neutral~default.png"),
    asset("mia/30_face.happy.png"),
    asset("mia/10_hat.on.png"),
    asset("office/20_door.closed~default.png"),
    asset("office/20_door.open.png"),
    asset("office/90_room.png"),
  ] });
  return compiler.compile({ textDocument: { uri } }).program!;
};

describe("raster portraits from numbered image folders", () => {
  it("keeps ordinary image assets working", () => {
    expect(compile().context?.["image"]?.["background"]?.src).toContain("background.png");
  });

  it("creates independent folder images and applies defaults with lowest number on top", () => {
    const context = compile().context!;
    expect(context["layered_image"]?.["mia"]).toBeDefined();
    expect(resolveImageLayers(context, context["layered_image"]?.["mia"]).map(l => l.src)).toEqual([
      "/file:/local/assets/mia/90_body.png?v=1",
      "/file:/local/assets/mia/30_face.neutral~default.png?v=1",
    ]);
    expect(resolveImageLayers(context, context["layered_image"]?.["office"]).map(l => l.src)).toEqual([
      "/file:/local/assets/office/90_room.png?v=1",
      "/file:/local/assets/office/20_door.closed~default.png?v=1",
    ]);
  });

  it("selects multiple attributes without retaining inactive alternatives", () => {
    const context = compile().context!;
    const look = { $type: "filtered_image", $name: "party", image: { $type: "layered_image", $name: "mia" }, attributes: ["happy", "hat"] };
    context["filtered_image"] ??= {};
    context["filtered_image"]["party"] = look;
    expect(resolveImageLayers(context, look).map(l => l.src)).toEqual([
      "/file:/local/assets/mia/90_body.png?v=1",
      "/file:/local/assets/mia/30_face.happy.png?v=1",
      "/file:/local/assets/mia/10_hat.on.png?v=1",
    ]);
  });

  it("lets an explicit layered_image override its folder", () => {
    const context = compile("define mia as layered_image with\n  assets = { background }\nend\n").context!;
    expect(resolveImageLayers(context, context["layered_image"]?.["mia"]).map(l => l.src)).toEqual([
      "/file:/local/assets/background.png?v=1",
    ]);
  });
});
