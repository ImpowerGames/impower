import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";

// Assets belong to a project the way scripts do (#1388): a compile sees the
// files under the folder of its main script, outside any subfolder holding a
// main script of its own and any skipped name. Asset names are a namespace per
// project, so a name two projects share is no collision.

const ROOT = "file:///repo/game/";
const MAIN_URI = `${ROOT}main.sd`;
const SUB_MAIN_URI = `${ROOT}sub/main.sd`;
const COLLISION_HINT = "Asset name collision";

const msg = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

const collisionsOn = (program: any, uri: string): any[] =>
  (program.diagnostics?.[uri] ?? []).filter((d: any) =>
    msg(d).includes(COLLISION_HINT),
  );

const assetFile = (uri: string, type = "image"): File => {
  const base = uri.split("/").slice(-1)[0]!;
  const dot = base.lastIndexOf(".");
  return {
    uri,
    type,
    name: dot >= 0 ? base.slice(0, dot) : base,
    ext: dot >= 0 ? base.slice(dot + 1) : "",
    src: `${uri}?v=1`,
  };
};

const scriptFile = (uri: string, text = ""): File => {
  const base = uri.split("/").slice(-1)[0]!;
  return {
    uri,
    type: "script",
    name: base.replace(/\.sd$/, ""),
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  };
};

const svgPortrait = (uri: string): File => ({
  ...assetFile(uri),
  ext: "svg",
  text: `<svg xmlns="http://www.w3.org/2000/svg"><g id="face"><g id="happy"><rect/></g><g id="sad"><rect/></g></g></svg>`,
});

const configured = (files: File[]) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files });
  return compiler;
};

const compile = (compiler: SparkdownCompiler, uri = MAIN_URI) =>
  compiler.compile({ textDocument: { uri } }).program!;

const fileUris = (program: any): string[] =>
  Object.values(program.files ?? {}).map((f: any) => f.uri);

describe("assets scoped to the project of the compiled script", () => {
  it("leaves out an asset in a sub-project, above the root or under a skipped name", () => {
    const own = `${ROOT}assets/forest.png`;
    const sub = `${ROOT}sub/assets/desert.png`;
    const above = "file:///repo/shared/cave.png";
    const modules = `${ROOT}node_modules/pkg/river.png`;
    const dotted = `${ROOT}.drafts/lake.png`;
    const program = compile(
      configured([
        scriptFile(MAIN_URI),
        scriptFile(SUB_MAIN_URI),
        assetFile(own),
        assetFile(sub),
        assetFile(above),
        assetFile(modules),
        assetFile(dotted),
      ]),
    );
    expect(program.context?.["image"]?.["forest"]?.uri).toBe(own);
    for (const name of ["desert", "cave", "river", "lake"]) {
      expect(program.context?.["image"]?.[name]).toBeUndefined();
    }
    expect(fileUris(program)).toEqual([own]);
  });

  it("gives a sub-project its own assets and not its parent's", () => {
    const own = `${ROOT}assets/forest.png`;
    const sub = `${ROOT}sub/assets/desert.png`;
    const program = compile(
      configured([
        scriptFile(MAIN_URI),
        scriptFile(SUB_MAIN_URI),
        assetFile(own),
        assetFile(sub),
      ]),
      SUB_MAIN_URI,
    );
    expect(program.context?.["image"]?.["desert"]?.uri).toBe(sub);
    expect(program.context?.["image"]?.["forest"]).toBeUndefined();
    expect(fileUris(program)).toEqual([sub]);
  });

  it("warns on both files when two assets in one project share a type and name", () => {
    const a = `${ROOT}backgrounds/forest.png`;
    const b = `${ROOT}scripts/chapters/forest.png`;
    const program = compile(
      configured([
        scriptFile(MAIN_URI),
        scriptFile(SUB_MAIN_URI),
        assetFile(a),
        assetFile(b),
      ]),
    );
    expect(collisionsOn(program, a)).toHaveLength(1);
    expect(collisionsOn(program, b)).toHaveLength(1);
  });

  it("warns on neither when the same two assets are in different projects", () => {
    const a = `${ROOT}backgrounds/forest.png`;
    const b = `${ROOT}sub/backgrounds/forest.png`;
    const compiler = configured([
      scriptFile(MAIN_URI),
      scriptFile(SUB_MAIN_URI),
      assetFile(a),
      assetFile(b),
    ]);
    for (const entry of [MAIN_URI, SUB_MAIN_URI]) {
      const program = compile(compiler, entry);
      expect(collisionsOn(program, a)).toHaveLength(0);
      expect(collisionsOn(program, b)).toHaveLength(0);
    }
  });

  it("does not count a raster portrait folder in another project as a collision", () => {
    const layer = (root: string, path: string) =>
      assetFile(`${root}assets/mia/${path}`);
    const compiler = configured([
      scriptFile(MAIN_URI),
      scriptFile(SUB_MAIN_URI),
      layer(ROOT, "90_body.png"),
      layer(ROOT, "30_face.happy~default.png"),
      layer(`${ROOT}sub/`, "90_body.png"),
      layer(`${ROOT}sub/`, "30_face.sad~default.png"),
    ]);
    for (const [entry, root] of [
      [MAIN_URI, ROOT],
      [SUB_MAIN_URI, `${ROOT}sub/`],
    ] as const) {
      const program = compile(compiler, entry);
      const mia = program.context?.["layered_image"]?.["mia"];
      expect(mia).toBeDefined();
      expect(JSON.stringify(mia)).toContain(`${root}assets/mia/90_body.png`);
      const other = root === ROOT ? `${ROOT}sub/` : ROOT;
      expect(JSON.stringify(mia)).not.toContain(`${other}assets/mia/`);
      for (const diagnostics of Object.values(program.diagnostics ?? {})) {
        expect(diagnostics.filter((d: any) => msg(d).includes(COLLISION_HINT)))
          .toHaveLength(0);
      }
    }
  });

  it("drops a portrait's assets from the next compile once a main script makes its folder a project", () => {
    const portrait = `${ROOT}sub/assets/bunny.svg`;
    const twin = `${ROOT}assets/bunny.svg`;
    const compiler = configured([
      scriptFile(MAIN_URI, "== start\n[[show image bunny]]\n"),
      svgPortrait(portrait),
      svgPortrait(twin),
    ]);
    const before = compile(compiler);
    expect(fileUris(before)).toEqual(expect.arrayContaining([portrait, twin]));
    expect(collisionsOn(before, portrait)).toHaveLength(1);
    expect(collisionsOn(before, twin)).toHaveLength(1);

    compiler.addFile({ file: scriptFile(SUB_MAIN_URI) });
    const after = compile(compiler);
    expect(fileUris(after)).toEqual([twin]);
    expect(after.context?.["image"]?.["bunny"]?.uri).toBe(twin);
    expect(collisionsOn(after, portrait)).toHaveLength(0);
    expect(collisionsOn(after, twin)).toHaveLength(0);
  });

  it("drops an asset from the next compile once it moves out of the project", () => {
    const inside = `${ROOT}assets/forest.png`;
    const outside = "file:///repo/shared/forest.png";
    const compiler = configured([scriptFile(MAIN_URI), assetFile(inside)]);
    expect(compile(compiler).context?.["image"]?.["forest"]?.uri).toBe(inside);

    compiler.removeFile({ file: assetFile(inside) });
    compiler.addFile({ file: assetFile(outside) });
    const after = compile(compiler);
    expect(after.context?.["image"]?.["forest"]).toBeUndefined();
    expect(fileUris(after)).toEqual([]);
  });
});
