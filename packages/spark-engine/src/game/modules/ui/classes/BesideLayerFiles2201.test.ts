import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { describe, expect, it } from "vitest";
import { UIModule } from "./UIModule";

class ProbeUIModule extends UIModule {
  constructor(context: any) {
    super({} as any);
    Object.defineProperty(this, "context", { get: () => context, configurable: true });
  }
}

const workspace = Object.create(SparkdownWorkspace.prototype) as SparkdownWorkspace;
workspace.loadConfiguration({ imageFiles: "**/*.png" });
const ROOT = "file:///proj";
const MAIN = `${ROOT}/main.sd`;
const P = `${ROOT}/assets/Images/Portraits`;

const FILES = [
  `${P}/ava.png`,
  `${P}/ava@night.png`,
  `${P}/ava~20_face.happy.png`,
  `${P}/ava~20_face.sad.png`,
  `${P}/ava~30_mouth.closed~default.png`,
  `${P}/ava~30_mouth.open.png`,
  `${P}/ava~10_hat.on.png`,
  `${P}/ava@night~face.happy.png`,
  `${P}/mia/90_body.png`,
  `${P}/mia/30_face.happy.png`,
  `${P}/mia/30_face.neutral~default.png`,
];

const TEXT = `scene start
  [[ava]]
  [[ava:happy:hat]]
  [[ava@night:face.happy]]
  [[mia:happy]]
end
`;

const engine = () => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: TEXT, version: 1, languageId: "sparkdown" },
      ...FILES.map((uri) => ({
        uri,
        type: workspace.getFileType(uri),
        name: workspace.getFileName(uri),
        ext: workspace.getFileExtension(uri),
        src: `/src/${uri.slice(P.length + 1)}`,
        version: 1,
      })),
    ] as never,
  });
  return new ProbeUIModule(compiler.compile({ textDocument: { uri: MAIN } }).program.context);
};

describe("the engine draws a picture's layer files with it (#2201)", () => {
  it("draws [[ava:happy:hat]] as the base, the closed mouth, the happy face and the hat, bottom to top", () => {
    expect(engine().getImageSrcsByName("ava:happy:hat")).toEqual([
      "/src/ava.png",
      "/src/ava~30_mouth.closed~default.png",
      "/src/ava~20_face.happy.png",
      "/src/ava~10_hat.on.png",
    ]);
  });

  it("draws [[ava]] as the base and each group's default", () => {
    expect(engine().getImageSrcsByName("ava")).toEqual(["/src/ava.png", "/src/ava~30_mouth.closed~default.png"]);
  });

  it("draws [[ava@night:face.happy]] as the night picture and its own layer", () => {
    expect(engine().getImageSrcsByName("ava@night:face.happy")).toEqual(["/src/ava@night.png", "/src/ava@night~face.happy.png"]);
  });

  it("draws a folder stack in the same project as it did", () => {
    expect(engine().getImageSrcsByName("mia:happy")).toEqual(["/src/mia/90_body.png", "/src/mia/30_face.happy.png"]);
  });
});
