import { describe, expect, it } from "vitest";
import { createSceneAssetCapture } from "../../compiler/types/SceneAssets";
import { scanAssetDirectives } from "../../compiler/utils/scanAssetDirectives";

// The scanner must read a directive the way the runtime interpreter does
// (`InterpreterModule.createAssetChunk`): verb, then target, then names up to
// the first clause keyword, names split on `+`. It only ever feeds the
// preloader, so a superset is harmless and a miss costs a late asset.

const scan = (text: string) => {
  const capture = createSceneAssetCapture();
  const beat = scanAssetDirectives(text, "Scene.0", capture);
  return { capture, beat };
};

describe("scanAssetDirectives", () => {
  it("reads image names after the verb and layer, splitting on +", () => {
    const { beat } = scan("[[show portrait bunny~hat+hat with fade over 1s]]");
    expect(beat?.image).toEqual(["bunny~hat", "hat"]);
    expect(beat?.path).toBe("Scene.0");
  });

  it("treats every token as a name when there is no verb", () => {
    const { beat } = scan("[[bunny sad]] ((chime))");
    expect(beat?.image).toEqual(["bunny", "sad"]);
    expect(beat?.audio).toEqual(["chime"]);
  });

  it("stops at the first clause keyword and drops `none`", () => {
    const { beat } = scan("[[show backdrop none room after 1s]]");
    expect(beat?.image).toEqual(["room"]);
  });

  it("ignores verbs that need nothing loaded", () => {
    const { beat } = scan("[[hide portrait bunny]] ((stop music theme))");
    expect(beat).toBeUndefined();
  });

  it("records audio played or queued on a channel", () => {
    const { beat } = scan("((play music theme loop)) ((queue sound a+b))");
    expect(beat?.audio).toEqual(["theme", "a", "b"]);
  });

  it("records the layouts a beat opens or navigates to", () => {
    const { beat } = scan(
      "[[open hud with fade]] [[navigate menu to settings]] [[close hud]]",
    );
    expect(beat?.layouts).toEqual(["hud", "settings"]);
  });

  it("records every flow a `load` names", () => {
    const { beat } = scan("[[load Chapter2 Chapter3 with fade]]");
    expect(beat?.loads).toEqual(["Chapter2", "Chapter3"]);
  });

  it("finds directives inline after display text", () => {
    const { beat } = scan("Hello there. [[show portrait bunny]] ((play sound hi))");
    expect(beat?.image).toEqual(["bunny"]);
    expect(beat?.audio).toEqual(["hi"]);
  });

  it("marks a directive cut off by an interpolation as dynamic, keeping the base", () => {
    const { capture, beat } = scan("[[show portrait bunny~");
    expect(beat).toBeUndefined();
    expect(capture.dynamic).toBe(true);
    expect(capture.dynamicBases).toEqual(["bunny"]);
  });

  it("has no base when the whole name is dynamic", () => {
    const { capture } = scan("[[show portrait ");
    expect(capture.dynamic).toBe(true);
    expect(capture.dynamicBases).toEqual([]);
  });

  it("does not treat the tail of a split directive as an opener", () => {
    const { capture, beat } = scan("]] and more text ((");
    expect(beat).toBeUndefined();
    // The trailing `((` is a genuine unclosed opener.
    expect(capture.dynamic).toBe(true);
  });

  it("skips escaped and raw brackets", () => {
    const { capture, beat } = scan("\\[[not a directive]] `[[nor this]]`");
    expect(beat).toBeUndefined();
    expect(capture.dynamic).toBe(false);
  });

  it("accumulates beats on the capture in call order", () => {
    const capture = createSceneAssetCapture();
    scanAssetDirectives("[[show backdrop a]]", "S.0", capture);
    scanAssetDirectives("plain text", "S.1", capture);
    scanAssetDirectives("((play music b))", "S.2", capture);
    expect(capture.beats.map((b) => b.path)).toEqual(["S.0", "S.2"]);
  });
});
