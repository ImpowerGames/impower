import { expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";

it("refreshes generated raster images after an asset changes or disappears", () => {
  const uri = "file:///project/main.sd";
  const compiler = new SparkdownCompiler();
  const file = { uri: "file:///project/assets/mia/10_hat.on.png", type: "image", name: "10_hat", ext: "png", src: "/first.png" };
  compiler.configure({ files: [
    { uri, type: "script", name: "main", ext: "sd", text: "[[mia:hat]]", languageId: "sparkdown", version: 1 },
    file,
  ] });
  const compile = () => compiler.compile({ textDocument: { uri } }).program;
  const drawn = (program: ReturnType<typeof compile>) => resolveImageLayers(program.context, program.context?.["filtered_image"]?.["mia~hat"]).map((layer) => layer.src);
  expect(drawn(compile())).toEqual(["/first.png"]);
  compiler.updateFile({ file: { ...file, src: "/changed.png" } });
  expect(drawn(compile())).toEqual(["/changed.png"]);
  compiler.removeFile({ file });
  const removed = compile();
  expect(removed.context?.["layered_image"]?.["mia"]).toBeUndefined();
  expect(drawn(removed)).toEqual([]);
});
