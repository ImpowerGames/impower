import { expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";

it("lets explicit layered images reference their numbered raster files", () => {
  const uri = "file:///project/main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri, type: "script", name: "main", ext: "sd", version: 1, languageId: "sparkdown", text: `define mia as layered_image with
  assets = { { ["$type"] = "image", ["$name"] = "90_body" } }
end
` },
    { uri: "file:///project/assets/mia/90_body.png", type: "image", name: "90_body", ext: "png", src: "/body.png" },
  ] });
  const program = compiler.compile({ textDocument: { uri } }).program;
  expect(resolveImageLayers(program.context, program.context?.["layered_image"]?.["mia"]).map((layer) => layer.src)).toEqual(["/body.png"]);
});

it("renders explicitly listed full stems without reinterpreting their filename conditions", () => {
  const uri = "file:///project/main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri, type: "script", name: "main", ext: "sd", version: 1, languageId: "sparkdown", text: `define mia as layered_image with
  assets = {
    { ["$type"] = "image", ["$name"] = "30_face.happy~default" },
    { ["$type"] = "image", ["$name"] = "30_face.sad" },
  }
end
` },
    { uri: "file:///project/assets/mia/30_face.happy~default.png", type: "image", name: "30_face", ext: "png", src: "/happy.png" },
    { uri: "file:///project/assets/mia/30_face.sad.png", type: "image", name: "30_face", ext: "png", src: "/sad.png" },
  ] });
  const program = compiler.compile({ textDocument: { uri } }).program;
  expect(resolveImageLayers(program.context, program.context?.["layered_image"]?.["mia"]).map((layer) => layer.src)).toEqual(["/happy.png", "/sad.png"]);
});
