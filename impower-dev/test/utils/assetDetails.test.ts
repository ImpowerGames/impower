import { describe, expect, it } from "vitest";
import {
  assetDetails,
  neighborsOf,
  NOT_USED_NOTES,
  titleLine,
  whereOf,
  type InspectedAsset,
  type MeasuredAsset,
} from "../../src/modules/spark-editor/utils/assetDetails";

const FOLDERS = { backdrop: "Backdrops", portrait: "Portraits", music: "Music", sound: "Sounds" };

const asset = (path: string, type: InspectedAsset["type"], more: Partial<InspectedAsset> = {}): InspectedAsset => ({
  path,
  name: path.slice(path.lastIndexOf("/") + 1).split(".")[0]!,
  type,
  files: [{ path, size: 1_258_291 }],
  ...more,
});

const rows = (target: InspectedAsset, measured: MeasuredAsset = {}) =>
  assetDetails({ asset: target, home: "Assets", folders: FOLDERS, measured }).map(
    ({ label, value }) => `${label}: ${value}`,
  );

describe("the inspector's details rows", () => {
  it.each<[string, InspectedAsset, MeasuredAsset, string[]]>([
    [
      "a backdrop in a folder the Add menu lists",
      asset("Assets/Images/Backdrops/harbor.png", "image"),
      { pixels: { width: 1920, height: 1080 } },
      [
        "Type: Image · PNG",
        "Add menu: Backdrop, from the Backdrops folder",
        "Size: 1920 × 1080",
        "File: 1.2 MB",
        "Where: Images/Backdrops",
      ],
    ],
    [
      "a picture not yet measured, outside the Add menu's folders",
      asset("Assets/Images/bunny.webp", "image", { files: [{ path: "Assets/Images/bunny.webp", size: 600 }] }),
      { pixels: null },
      ["Type: Image · WEBP", "File: 600 B", "Where: Images"],
    ],
    [
      "a stack of three files",
      asset("Assets/Images/Portraits/imani.png", "image", {
        files: [
          { path: "Assets/Images/Portraits/imani.png", size: 1024 },
          { path: "Assets/Images/Portraits/imani@night.png", size: 2048 },
          { path: "Assets/Images/Portraits/imani~face.happy.png", size: 1024 },
        ],
        variantCount: 3,
      }),
      { pixels: { width: 300, height: 600 } },
      [
        "Type: Image · PNG",
        "Add menu: Portrait, from the Portraits folder",
        "Size: 300 × 600",
        "Files: 3 files · 4 kB",
        "Where: Images/Portraits",
      ],
    ],
    [
      "a sound under Sounds, with its length",
      asset("Assets/Audio/Sounds/chime.wav", "audio", { files: [{ path: "Assets/Audio/Sounds/chime.wav", size: 22_444 }] }),
      { seconds: 84.4 },
      ["Type: Audio · WAV", "Add menu: Sound, from the Sounds folder", "Length: 1:24", "File: 22 kB", "Where: Audio/Sounds"],
    ],
    [
      "a video before its length is known",
      asset("Assets/Video/intro.webm", "video", { files: [{ path: "Assets/Video/intro.webm", size: 20_352 }] }),
      { seconds: null },
      ["Type: Video · WEBM", "File: 20 kB", "Where: Video"],
    ],
    [
      "a font at the assets root",
      asset("Assets/courier_prime.ttf", "font", { files: [{ path: "Assets/courier_prime.ttf", size: 2048 }] }),
      {},
      ["Type: Font · TTF", "File: 2 kB", "Where: Assets root"],
    ],
    [
      "a text note",
      asset("Assets/Text/notes.txt", "text", { files: [{ path: "Assets/Text/notes.txt", size: 180 }] }),
      {},
      ["Type: Text · TXT", "File: 180 B", "Where: Text"],
    ],
    [
      "a linked picture",
      asset("Assets/Images/Backdrops/sky.url", "image", {
        link: true,
        address: "https://example.com/sky.jpg",
        files: [{ path: "Assets/Images/Backdrops/sky.url", size: 27 }],
      }),
      {},
      ["Type: Image · JPG · link", "Add menu: Backdrop, from the Backdrops folder", "File: 27 B", "Where: Images/Backdrops"],
    ],
    [
      "a file of another kind, with an infinite length ignored",
      asset("Assets/Other/table.csv", "other", { files: [{ path: "Assets/Other/table.csv", size: 19 }] }),
      { seconds: Number.POSITIVE_INFINITY },
      ["Type: File · CSV", "File: 19 B", "Where: Other"],
    ],
  ])("%s", (_name, target, measured, expected) => {
    expect(rows(target, measured)).toEqual(expected);
  });

  it("names the Add menu folder as the path spells it", () => {
    expect(rows(asset("assets/images/backdrops/harbor.png", "image"), {})[1]).toBe(
      "Add menu: Backdrop, from the backdrops folder",
    );
  });

  it("reads lengths as minutes and seconds, and hours past an hour", () => {
    const length = (seconds: number) => rows(asset("Assets/Audio/a.wav", "audio"), { seconds }).find((row) => row.startsWith("Length"));
    expect([0.4, 9.6, 84, 600, 3725].map(length)).toEqual(["Length: 0:00", "Length: 0:10", "Length: 1:24", "Length: 10:00", "Length: 1:02:05"]);
  });

  it("says Assets root for a file directly under the assets folder", () => {
    expect(whereOf("Assets/harbor.png", "Assets")).toBe("Assets root");
    expect(whereOf("Elsewhere/harbor.png", "Assets")).toBe("Elsewhere");
  });
});

describe("the inspector's head", () => {
  it("reads the type, its ending and the variants", () => {
    expect(titleLine(asset("Assets/Images/harbor.png", "image"))).toBe("Image · PNG");
    expect(titleLine(asset("Assets/Images/Portraits/imani.png", "image", { variantCount: 3 }))).toBe(
      "Image · PNG · 3 variants",
    );
    expect(titleLine(asset("Assets/Images/one.png", "image", { variantCount: 1 }))).toBe("Image · PNG");
  });

  it("has a note for each type with no uses", () => {
    expect(NOT_USED_NOTES.image).toBe("Nothing shows it yet. Copy its name into a script to use it.");
    expect(NOT_USED_NOTES.audio).toBe("Nothing plays it yet.");
    expect(NOT_USED_NOTES.font).toBe("No style uses it yet.");
    expect(NOT_USED_NOTES.other).toBe("Nothing in the story refers to it.");
  });
});

describe("the inspector's neighbours", () => {
  const items = ["a", "b", "c"].map((path) => ({ path }));

  it("steps through the list in its own order and stops at either end", () => {
    expect(neighborsOf(items, "a")).toEqual({ at: 0, count: 3, previous: null, next: { path: "b" } });
    expect(neighborsOf(items, "b")).toEqual({ at: 1, count: 3, previous: { path: "a" }, next: { path: "c" } });
    expect(neighborsOf(items, "c")).toEqual({ at: 2, count: 3, previous: { path: "b" }, next: null });
  });

  it("has no neighbours for an item the list does not show", () => {
    expect(neighborsOf(items, "z")).toEqual({ at: -1, count: 3, previous: null, next: null });
  });
});
