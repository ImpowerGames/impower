import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";

// Asset names are a FLAT namespace: a script references an asset by its bare
// name (`[[show image forest]]` -> context.image.forest), so two assets sharing
// a basename in different folders are ambiguous. The compiler must WARN (not
// silently resolve to whichever file was processed last). Scripts are exempt —
// they're keyed by their full path elsewhere, not by a flat basename.

const MAIN_URI = "file://proj/main.sd";
const COLLISION_HINT = "Asset name"; // substring of the collision message

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

const scriptFile = (uri: string): File => {
  const base = uri.split("/").slice(-1)[0]!;
  return {
    uri,
    type: "script",
    name: base.replace(/\.sd$/, ""),
    ext: "sd",
    text: "",
    version: 1,
    languageId: "sparkdown",
  };
};

function compileWithFiles(extra: File[]) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [scriptFile(MAIN_URI), ...extra],
  });
  return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
}

describe("asset name collision diagnostic (flat asset namespace)", () => {
  it("warns on BOTH files when two assets in different folders share a basename", () => {
    const a = "file://proj/backgrounds/forest.png";
    const b = "file://proj/flashbacks/forest.png";
    const program = compileWithFiles([assetFile(a), assetFile(b)]);
    expect(collisionsOn(program, a).length).toBeGreaterThan(0);
    expect(collisionsOn(program, b).length).toBeGreaterThan(0);
    expect(msg(collisionsOn(program, a)[0])).toContain("forest");
  });

  it("does NOT warn for assets with distinct basenames", () => {
    const a = "file://proj/backgrounds/forest.png";
    const b = "file://proj/backgrounds/desert.png";
    const program = compileWithFiles([assetFile(a), assetFile(b)]);
    expect(collisionsOn(program, a)).toHaveLength(0);
    expect(collisionsOn(program, b)).toHaveLength(0);
  });

  it("does NOT warn for a single asset (no collision)", () => {
    const a = "file://proj/backgrounds/forest.png";
    const program = compileWithFiles([assetFile(a)]);
    expect(collisionsOn(program, a)).toHaveLength(0);
  });

  it("warns across THREE colliding assets (each file flagged)", () => {
    const a = "file://proj/a/forest.png";
    const b = "file://proj/b/forest.png";
    const c = "file://proj/c/forest.png";
    const program = compileWithFiles([assetFile(a), assetFile(b), assetFile(c)]);
    expect(collisionsOn(program, a).length).toBeGreaterThan(0);
    expect(collisionsOn(program, b).length).toBeGreaterThan(0);
    expect(collisionsOn(program, c).length).toBeGreaterThan(0);
  });

  it("does NOT warn for two scripts sharing a basename (scripts are path-keyed)", () => {
    const a = "file://proj/chapters/intro.sd";
    const b = "file://proj/acts/intro.sd";
    const program = compileWithFiles([scriptFile(a), scriptFile(b)]);
    expect(collisionsOn(program, a)).toHaveLength(0);
    expect(collisionsOn(program, b)).toHaveLength(0);
  });

  it("warns only within a type (an image and an audio sharing a basename do NOT collide)", () => {
    const img = "file://proj/forest.png";
    const aud = "file://proj/forest.mp3";
    const program = compileWithFiles([
      assetFile(img, "image"),
      assetFile(aud, "audio"),
    ]);
    expect(collisionsOn(program, img)).toHaveLength(0);
    expect(collisionsOn(program, aud)).toHaveLength(0);
  });
});
