import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";

// `sceneAssets` rides the incremental per-flow location cache: an edit inside
// one scene re-walks that scene only, and every other scene contributes the
// capture object it produced last compile. The oracle is a cold compile of the
// edited text; the reuse proof is object identity.

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

class Probe extends SparkdownCompiler {
  captureOf(name: string) {
    return this._flowAssetAccum?.get(name);
  }
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

function coldSceneAssets(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [file(text, 1)] });
  return compiler.compile({ textDocument: { uri: URI } }).program.sceneAssets;
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
  it("an edit inside one scene recomputes that scene and reuses the others", () => {
    quiet(() => {
      const base = fixture();
      const probe = new Probe();
      probe.configure({ files: [file(base, 1)] });
      const first = probe.compile({ textDocument: { uri: URI } }).program;
      const untouchedBefore = probe.captureOf("scene_3");
      const editedBefore = probe.captureOf("scene_1");
      expect(untouchedBefore).toBeDefined();
      expect(editedBefore).toBeDefined();

      const find = "location_1]]";
      const replace = "location_1_edited]]";
      const offset = base.indexOf(find);
      expect(offset).toBeGreaterThanOrEqual(0);
      const start = posAt(base, offset);
      const end = posAt(base, offset + find.length);
      const after =
        base.slice(0, offset) + replace + base.slice(offset + find.length);

      probe.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [{ range: { start, end }, text: replace }],
      });
      const second = probe.compile({ textDocument: { uri: URI } }).program;

      expect(second.sceneAssets).toEqual(coldSceneAssets(after));
      expect(second.sceneAssets!["scene_1"]!.image).toEqual([
        "location_1_edited",
        "face_1~smile",
      ]);
      expect(second.sceneAssets!["scene_1"]!.successors).toEqual(["scene_2"]);

      // Reused: the very same capture object as last compile. Recomputed: a
      // new one.
      expect(probe.captureOf("scene_3")).toBe(untouchedBefore);
      expect(probe.captureOf("scene_1")).not.toBe(editedBefore);
      expect(second.sceneAssets!["scene_3"]!.beats).toBe(
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
