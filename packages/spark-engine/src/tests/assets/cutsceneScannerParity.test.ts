import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createSceneAssetCapture } from "@impower/sparkdown/src/compiler/types/SceneAssets";
import { scanAssetDirectives } from "@impower/sparkdown/src/compiler/utils/scanAssetDirectives";
import { describe, expect, it } from "vitest";
import { createHarness } from "../ui/harness/uiTestHarness";

const ASSETS: File[] = [
  {
    uri: "inmemory:///intro.webm",
    type: "video",
    name: "intro",
    ext: "webm",
    src: "/file:/proj/intro.webm?v=1",
  },
];

const scanned = (body: string): string[] => {
  const capture = createSceneAssetCapture();
  return scanAssetDirectives(`[[${body}]]`, 0, capture)?.image ?? [];
};

const interpreter = async () => {
  const h = createHarness("-> start\n\nscene start\n  A line.\nend\n", 0, {
    assets: ASSETS,
  });
  await h.ready;
  return h.game.module.interpreter as any;
};

const CUTSCENES = [
  "play intro",
  "play intro loop",
  "play intro mute",
  "play intro with fade",
  "play intro loop mute with fade over 1s",
  "play intro~hat",
  "play  intro",
  "play\tintro loop",
];

describe("the scanner and the interpreter agree on a cutscene's video", () => {
  for (const body of CUTSCENES) {
    it(`[[${body}]]`, async () => {
      const chunk = (await interpreter()).createCutsceneChunk(body);
      expect(chunk.tag).toBe("cutscene");
      expect(chunk.target).toBeTruthy();
      expect(scanned(body)).toEqual([chunk.target]);
    });
  }

  it("names no layer, as the generic asset chunk would read one", async () => {
    const runtime = await interpreter();
    expect(
      runtime.createAssetChunk("play intro", "cutscene", "play", ""),
    ).toMatchObject({ control: "play", target: "intro", assets: [] });
    expect(scanned("show portrait intro")).toEqual(
      runtime.createAssetChunk("show portrait intro", "image", "show", "")
        .assets,
    );
  });
});
