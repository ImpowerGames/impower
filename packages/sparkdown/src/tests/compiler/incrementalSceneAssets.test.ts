import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import type { SparkProgram } from "../../compiler/types/SparkProgram";

// `sceneAssets` after an incremental compile: an edit inside one scene
// changes that scene's assets and leaves every other scene's as they were.
// The oracle is a cold compile of the edited text.

const URI = "file://proj/main.sd";

const file = (text: string, version: number): File => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

const SCENES = 6;

function fixture(): string {
  const L: string[] = [];
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < SCENES; s++) {
    L.push(`scene scene_${s}`);
    L.push(`  [[show backdrop location_${s}]]`);
    L.push(`  ((play music track_${s}))`);
    L.push(`  Line one in scene ${s}.`);
    L.push(`  Another line. [[show portrait face_${s}~smile]]`);
    L.push(`  -> scene_${(s + 1) % SCENES}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** A program's scene assets with each beat's address read as where it
 *  stands: an address counts the chunks the compiler has made, so an
 *  incremental compile's differs from a cold compile's for the same beat. */
function sceneAssetsOf(program: SparkProgram) {
  return JSON.parse(
    JSON.stringify(program.sceneAssets, (key, value) =>
      key === "address" && typeof value === "number"
        ? program.chunks!.locationOf(value)
        : value,
    ),
  );
}

function coldSceneAssets(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [file(text, 1)] });
  return sceneAssetsOf(compiler.compile({ textDocument: { uri: URI } }).program);
}

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

describe("incremental sceneAssets", () => {
  it("an edit inside one scene changes that scene's assets and leaves the others", () => {
    quiet(() => {
      const base = fixture();
      const compiler = new SparkdownCompiler();
      compiler.configure({ files: [file(base, 1)] });
      const first = compiler.compile({ textDocument: { uri: URI } }).program;

      const find = "location_1]]";
      const replace = "location_1_edited]]";
      const offset = base.indexOf(find);
      expect(offset).toBeGreaterThanOrEqual(0);
      const start = posAt(base, offset);
      const end = posAt(base, offset + find.length);
      const after =
        base.slice(0, offset) + replace + base.slice(offset + find.length);

      compiler.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [{ range: { start, end }, text: replace }],
      });
      const second = compiler.compile({ textDocument: { uri: URI } }).program;

      expect(sceneAssetsOf(second)).toEqual(coldSceneAssets(after));
      expect(second.sceneAssets!["scene_1"]!.image).toEqual([
        "location_1_edited",
        "face_1~smile",
      ]);
      expect(second.sceneAssets!["scene_1"]!.successors).toEqual(["scene_2"]);
      expect(second.sceneAssets!["scene_3"]!.beats).toEqual(
        first.sceneAssets!["scene_3"]!.beats,
      );
    });
  });

  it("a recompile with no change keeps sceneAssets on the returned program", () => {
    quiet(() => {
      const text = fixture();
      const compiler = new SparkdownCompiler();
      compiler.configure({ files: [file(text, 1)] });
      const first = compiler.compile({ textDocument: { uri: URI } }).program;
      const second = compiler.compile({ textDocument: { uri: URI } }).program;
      expect(second.sceneAssets).toBeDefined();
      expect(second.sceneAssets).toEqual(first.sceneAssets);
    });
  });
});
