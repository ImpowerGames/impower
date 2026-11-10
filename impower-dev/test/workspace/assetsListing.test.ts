import { describe, expect, it } from "vitest";
import {
  assetEndingsOf,
  assetTypeOf,
} from "../../src/modules/spark-editor/utils/assetTypes";
import { rowLine } from "../../src/modules/spark-editor/utils/fileListModel";
import {
  assetLevel,
  assetName,
  assetSearch,
  assetSort,
  assetsHome,
  assetTrail,
  landingFolder,
  typeFolder,
  type AssetListing,
} from "../../src/modules/spark-editor/workspace/assetsListing";
import { PROJECT_SETTINGS_SCHEMA } from "../../src/modules/spark-editor/workspace/settings/settingsSchema";

const ENDINGS = assetEndingsOf({
  imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
  audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
  videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
  fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
});

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 12);

const listing = (
  paths: Record<string, number | { size: number; address: string }>,
  folders: string[] = [],
): AssetListing => ({
  files: Object.fromEntries(
    Object.entries(paths).map(([path, facts]) => [
      path,
      typeof facts === "number"
        ? { modified: NOW - DAY, size: facts }
        : { modified: NOW - DAY, ...facts },
    ]),
  ),
  folders,
});

const paths = (rows: { path: string }[]) => rows.map((row) => row.path);

describe("the asset type table", () => {
  it("reads a file's type from its extension through the File types settings", () => {
    expect(assetTypeOf("Assets/Images/bunny.PNG", ENDINGS)).toBe("image");
    expect(assetTypeOf("Assets/Audio/theme.wav", ENDINGS)).toBe("audio");
    expect(assetTypeOf("intro.webm", ENDINGS)).toBe("video");
    expect(assetTypeOf("notes.txt", ENDINGS)).toBe("text");
    expect(assetTypeOf("README.md", ENDINGS)).toBe("text");
    expect(assetTypeOf("courier_prime.ttf", ENDINGS)).toBe("font");
    expect(assetTypeOf("table.csv", ENDINGS)).toBe("other");
    expect(assetTypeOf("archive.zip", ENDINGS)).toBe("other");
    expect(assetTypeOf("no-extension", ENDINGS)).toBe("other");
  });

  it("follows an ending the project added to a type", () => {
    const endings = assetEndingsOf({
      imageFiles: "*.{png,avif}",
      audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
      videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
      fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
    });
    expect(assetTypeOf("lighthouse.avif", ENDINGS)).toBe("other");
    expect(assetTypeOf("lighthouse.avif", endings)).toBe("image");
    expect(assetTypeOf("lighthouse.jpg", endings)).toBe("other");
  });

  it("types a link by its address, and leaves an address of no known type under Other", () => {
    expect(assetTypeOf("Assets/horn.url", ENDINGS, "https://cdn.example.com/a/horn.mp3?v=2")).toBe("audio");
    expect(assetTypeOf("Assets/sky.url", ENDINGS, "https://cdn.example.com/sky.webp#top")).toBe("image");
    expect(assetTypeOf("Assets/page.url", ENDINGS, "https://example.com/about")).toBe("other");
    expect(assetTypeOf("Assets/empty.url", ENDINGS)).toBe("other");
  });
});

describe("the type folders", () => {
  it("are made under Assets in a project that has no assets folder yet", () => {
    const empty = listing({ "main.sd": 10 });
    expect(assetsHome(empty)).toBe("Assets");
    expect(typeFolder(empty, "font")).toBe("Assets/Fonts");
    expect(typeFolder(empty, "other")).toBe("Assets/Other");
  });

  it("are found in either spelling of the assets folder and of the type folder", () => {
    const lower = listing({ "assets/audio/theme.wav": 10 }, ["assets", "assets/audio"]);
    expect(assetsHome(lower)).toBe("assets");
    expect(typeFolder(lower, "audio")).toBe("assets/audio");
    expect(typeFolder(lower, "image")).toBe("assets/Images");
    const upper = listing({ "Assets/IMAGES/a.png": 10 });
    expect(assetsHome(upper)).toBe("Assets");
    expect(typeFolder(upper, "image")).toBe("Assets/IMAGES");
    const folderOnly = listing({}, ["ASSETS", "ASSETS/Video"]);
    expect(typeFolder(folderOnly, "video")).toBe("ASSETS/Video");
  });

  it("land a new file in the folder being viewed when it is under its type's folder, else in the type folder", () => {
    const project = listing({ "assets/music/theme.wav": 10 }, ["assets", "assets/Audio/Music"]);
    expect(landingFolder(project, "audio", "assets/Audio/Music")).toBe("assets/Audio/Music");
    expect(landingFolder(project, "audio", "assets/music")).toBe("assets/Audio");
    expect(landingFolder(project, "font", "assets/Audio/Music")).toBe("assets/Fonts");
    expect(landingFolder(listing({}), "font", "")).toBe("Assets/Fonts");
  });
});

describe("a tab's level", () => {
  const project = listing({
    "main.sd": 10,
    "Assets/Audio/Music/harbor_theme.wav": 2_000,
    "Assets/Audio/Music/night_market.wav": 1_000,
    "Assets/Audio/Sounds/door_chime.wav": 300,
    "Assets/Audio/Sounds/footsteps.wav": 400,
    "Assets/Images/bunny.png": 600,
    "Assets/Other/table.csv": 19,
  });

  it("starts at the type folder with its folders first, and counts the tab's files", () => {
    const level = assetLevel({ listing: project, type: "audio", sort: "name-asc", endings: ENDINGS });
    expect(level.root).toBe("Assets/Audio");
    expect(level.folder).toBe("Assets/Audio");
    expect(paths(level.rows)).toEqual(["Assets/Audio/Music", "Assets/Audio/Sounds"]);
    expect(level.rows.map((row) => row.holdings)).toEqual(["2 sounds", "2 sounds"]);
    expect(level.files).toBe(4);
    expect(level.empty).toBe(false);
  });

  it("opens a folder under the type folder and lists its files by the name a script writes", () => {
    const level = assetLevel({
      listing: project,
      type: "audio",
      folder: "Assets/Audio/Music",
      sort: "name-asc",
      endings: ENDINGS,
    });
    expect(level.folder).toBe("Assets/Audio/Music");
    expect(level.rows.map((row) => row.name)).toEqual(["harbor_theme", "night_market"]);
  });

  it("sorts by size and modified through the shared sort", () => {
    const level = assetLevel({
      listing: project,
      type: "audio",
      folder: "Assets/Audio/Music",
      sort: "size-asc",
      endings: ENDINGS,
    });
    expect(level.rows.map((row) => row.name)).toEqual(["night_market", "harbor_theme"]);
  });

  it("falls back to the type folder for a folder that is gone or belongs to another tab", () => {
    expect(assetLevel({ listing: project, type: "audio", folder: "Assets/Audio/Gone", sort: "", endings: ENDINGS }).folder).toBe("Assets/Audio");
    expect(assetLevel({ listing: project, type: "audio", folder: "Assets/Images", sort: "", endings: ENDINGS }).folder).toBe("Assets/Audio");
  });

  it("lists a file kept outside its type folder at its real path", () => {
    const old = listing({
      "assets/music/theme.wav": 20_000,
      "assets/rain.wav": 8_000,
      "assets/bunny.png": 600,
    });
    const root = assetLevel({ listing: old, type: "audio", sort: "name-asc", endings: ENDINGS });
    expect(root.root).toBe("assets/Audio");
    expect(paths(root.rows)).toEqual(["assets/music", "assets/rain.wav"]);
    expect(root.rows.map((row) => row.location)).toEqual(["assets", "assets"]);
    const inside = assetLevel({ listing: old, type: "audio", folder: "assets/music", sort: "name-asc", endings: ENDINGS });
    expect(inside.folder).toBe("assets/music");
    expect(paths(inside.rows)).toEqual(["assets/music/theme.wav"]);
    expect(inside.rows[0]!.location).toBe("assets/music");
    const images = assetLevel({ listing: old, type: "image", sort: "name-asc", endings: ENDINGS });
    expect(paths(images.rows)).toEqual(["assets/bunny.png"]);
  });

  it("lists a file kept in another type's folder at the root of its own tab, at its real path", () => {
    const mixed = listing({
      "Assets/Images/Harbor/gulls.wav": 100,
      "Assets/Images/Harbor/dock.png": 100,
      "Assets/Audio/theme.wav": 100,
    });
    const audio = assetLevel({ listing: mixed, type: "audio", sort: "name-asc", endings: ENDINGS });
    expect(audio.rows.map((row) => [row.path, row.location])).toEqual([
      ["Assets/Images/Harbor/gulls.wav", "Assets/Images/Harbor"],
      ["Assets/Audio/theme.wav", undefined],
    ]);
    expect(audio.files).toBe(2);
    const images = assetLevel({ listing: mixed, type: "image", folder: "Assets/Images/Harbor", sort: "", endings: ENDINGS });
    expect(paths(images.rows)).toEqual(["Assets/Images/Harbor/dock.png"]);
  });

  it("reads every spelling of the assets folder when a project has more than one", () => {
    const both = listing(
      { "Assets/Images/bunny.png": 600, "assets/Audio/theme.wav": 2048, "assets/rain.wav": 1024, "assets/dock.png": 300 },
      ["Assets", "Assets/Images", "assets", "assets/Audio"],
    );
    const audio = assetLevel({ listing: both, type: "audio", sort: "name-asc", endings: ENDINGS });
    expect(audio.root).toBe("Assets/Audio");
    expect(audio.rows.map((row) => [row.path, row.location])).toEqual([
      ["assets/Audio", "assets"],
      ["assets/rain.wav", "assets"],
    ]);
    expect(audio.files).toBe(2);
    const inside = assetLevel({ listing: both, type: "audio", folder: "assets/Audio", sort: "", endings: ENDINGS });
    expect(paths(inside.rows)).toEqual(["assets/Audio/theme.wav"]);
    const images = assetLevel({ listing: both, type: "image", sort: "name-asc", endings: ENDINGS });
    expect(paths(images.rows)).toEqual(["Assets/Images/bunny.png", "assets/dock.png"]);
    expect(assetSearch({ listing: both, query: "theme", sort: "", endings: ENDINGS }).map((g) => paths(g.rows))).toEqual([
      ["assets/Audio/theme.wav"],
    ]);
  });

  it("shows nested empty folders outside the type folders under Other, at every level", () => {
    const empty = listing({ "Assets/Images/bunny.png": 1 }, ["assets", "assets/misc", "assets/misc/empty"]);
    const root = assetLevel({ listing: empty, type: "other", sort: "", endings: ENDINGS });
    expect(root.rows.map((row) => [row.path, row.holdings])).toEqual([["assets/misc", "1 folder"]]);
    const misc = assetLevel({ listing: empty, type: "other", folder: "assets/misc", sort: "", endings: ENDINGS });
    expect(paths(misc.rows)).toEqual(["assets/misc/empty"]);
    expect(paths(assetLevel({ listing: empty, type: "audio", sort: "", endings: ENDINGS }).rows)).toEqual([]);
  });

  it("lists a link under the type its address names", () => {
    const links = listing({
      "assets/urls/ferry_horn.url": { size: 40, address: "https://example.com/sounds/ferry_horn.mp3" },
    });
    const audio = assetLevel({ listing: links, type: "audio", sort: "", endings: ENDINGS });
    expect(paths(audio.rows)).toEqual(["assets/urls"]);
    const inside = assetLevel({ listing: links, type: "audio", folder: "assets/urls", sort: "", endings: ENDINGS });
    expect(inside.rows.map((row) => [row.name, row.link])).toEqual([["ferry_horn", true]]);
  });

  it("is empty for a type with no files and says when the project has none at all", () => {
    expect(assetLevel({ listing: project, type: "font", sort: "", endings: ENDINGS })).toMatchObject({ empty: true, none: false });
    expect(assetLevel({ listing: listing({ "main.sd": 10 }), type: "image", sort: "", endings: ENDINGS })).toMatchObject({ empty: true, none: true });
  });

  it("shows an empty folder under its type folder", () => {
    const withEmpty = listing({ "Assets/Audio/theme.wav": 10 }, ["Assets/Audio/Ambience"]);
    const level = assetLevel({ listing: withEmpty, type: "audio", folder: "Assets/Audio/Ambience", sort: "", endings: ENDINGS });
    expect(level).toMatchObject({ folder: "Assets/Audio/Ambience", empty: true, none: false });
  });
});

describe("the trail", () => {
  const both = listing({ "Assets/Audio/Music/a.wav": 1, "assets/music/old/b.wav": 1 }, ["Assets", "assets"]);

  it("is empty at the type folder and leads back to it", () => {
    expect(assetTrail(both, "Assets/Audio", "Assets/Audio")).toEqual({ crumbs: [], parent: "Assets/Audio" });
  });

  it("names the folders below the type folder", () => {
    expect(assetTrail(both, "Assets/Audio", "Assets/Audio/Music")).toEqual({
      crumbs: [{ name: "Music", path: "Assets/Audio/Music" }],
      parent: "Assets/Audio",
    });
  });

  it("names a folder outside the type folder by its path below its own assets folder, and leads back to the tab", () => {
    expect(assetTrail(both, "Assets/Audio", "assets/music/old")).toEqual({
      crumbs: [
        { name: "music", path: "assets/music" },
        { name: "old", path: "assets/music/old" },
      ],
      parent: "assets/music",
    });
    expect(assetTrail(both, "Assets/Audio", "assets/music").parent).toBe("Assets/Audio");
  });
});

describe("the row line", () => {
  it("reads Modified <ago> · <size>", () => {
    const [row] = assetLevel({
      listing: listing({ "Assets/Audio/theme.wav": 570 * 1024 }),
      type: "audio",
      sort: "",
      endings: ENDINGS,
    }).rows;
    expect(rowLine({ entry: { ...row!, modified: NOW - 6 * DAY }, sort: "name-asc", location: row!.location, now: NOW })).toBe(
      "Modified 6d · 570 kB",
    );
  });

  it("leads with the real folder for a file kept outside its type folder", () => {
    const [row] = assetLevel({ listing: listing({ "assets/rain.wav": 2048 }), type: "audio", sort: "", endings: ENDINGS }).rows;
    expect(rowLine({ entry: row!, sort: "name-asc", location: row!.location, now: NOW })).toBe("assets · Modified 1d · 2 kB");
  });
});

describe("search", () => {
  const project = listing({
    "Assets/Audio/Music/theme.wav": 10,
    "Assets/Images/theme_card.png": 10,
    "Assets/Text/theme.md": 10,
    "Assets/Other/theme.csv": 10,
    "Assets/Audio/Sounds/door.wav": 10,
    "main.sd": 10,
  });

  it("finds files across every type and groups them by type in the tabs' order", () => {
    const groups = assetSearch({ listing: project, query: "theme", sort: "name-asc", endings: ENDINGS });
    expect(groups.map((group) => [group.title, paths(group.rows)])).toEqual([
      ["Images", ["Assets/Images/theme_card.png"]],
      ["Audio", ["Assets/Audio/Music/theme.wav"]],
      ["Text", ["Assets/Text/theme.md"]],
      ["Other", ["Assets/Other/theme.csv"]],
    ]);
    expect(groups[1]!.rows[0]!.location).toBe("Music");
    expect(groups[0]!.rows[0]!.location).toBe("Images");
  });

  it("matches every word against the path below the assets folder", () => {
    expect(assetSearch({ listing: project, query: "sounds door", sort: "", endings: ENDINGS }).map((g) => g.title)).toEqual(["Audio"]);
    expect(assetSearch({ listing: project, query: "assets", sort: "", endings: ENDINGS })).toEqual([]);
    expect(assetSearch({ listing: project, query: "  ", sort: "", endings: ENDINGS })).toEqual([]);
  });
});

describe("the Assets sort", () => {
  it("keeps Name, Modified and Size and turns any other sort into Name", () => {
    expect(assetSort("modified-desc")).toBe("modified-desc");
    expect(assetSort("size-asc")).toBe("size-asc");
    expect(assetSort("uses-desc")).toBe("name-asc");
    expect(assetSort("story")).toBe("name-asc");
    expect(assetSort(undefined)).toBe("name-asc");
  });
});

describe("asset names", () => {
  it("cut the file name at its first dot, as the compiler names a file", () => {
    expect(assetName("Assets/Images/hero.happy.png")).toBe("hero");
    expect(assetName("Assets/Audio/theme.wav")).toBe("theme");
    expect(assetName("Assets/.hidden")).toBe(".hidden");
  });
});

describe("stacked pictures on the Assets page", () => {
  const stacked = listing({
    "Assets/Images/Portraits/imani.png": 100,
    "Assets/Images/Portraits/imani@night.png": 200,
    "Assets/Images/Portraits/imani~face.happy.png": 10,
    "Assets/Images/Portraits/imani@night~face.sad.png": 20,
    "Assets/Images/Portraits/bunny.png": 50,
    "Assets/Images/Portraits/Extras/kai.png": 5,
    "Assets/Images/Portraits/Extras/zed.png": 5,
    "Assets/Audio/imani@night.wav": 5,
    "Assets/Audio/imani.wav": 5,
  });

  it("shows one row per thing, named as the script names it, with its variants, newest time and total size", () => {
    const level = assetLevel({
      listing: stacked,
      type: "image",
      folder: "Assets/Images/Portraits",
      sort: "name-asc",
      endings: ENDINGS,
    });
    expect(level.rows.map((row) => [row.kind, row.name, row.path, row.variantCount])).toEqual([
      ["folder", "Extras", "Assets/Images/Portraits/Extras", undefined],
      ["file", "bunny", "Assets/Images/Portraits/bunny.png", undefined],
      ["file", "imani", "Assets/Images/Portraits/imani.png", 2],
    ]);
    const imani = level.rows[2]!;
    expect(imani.size).toBe(330);
    expect(imani.paths).toHaveLength(4);
    expect(level.files).toBe(7);
  });

  it("covers a folder tile with up to four pictures from inside it", () => {
    const level = assetLevel({ listing: stacked, type: "image", sort: "name-asc", endings: ENDINGS });
    const portraits = level.rows.find((row) => row.name === "Portraits")!;
    expect(portraits.covers).toEqual([
      "Assets/Images/Portraits/Extras/kai.png",
      "Assets/Images/Portraits/Extras/zed.png",
      "Assets/Images/Portraits/bunny.png",
      "Assets/Images/Portraits/imani.png",
    ]);
  });

  it("leaves other types' files as they are", () => {
    const level = assetLevel({ listing: stacked, type: "audio", sort: "name-asc", endings: ENDINGS });
    expect(level.rows.map((row) => row.name)).toEqual(["imani", "imani@night"]);
    expect(level.rows.every((row) => row.variantCount === undefined && row.covers === undefined)).toBe(true);
  });

  it("rolls search results up the same way", () => {
    const [images] = assetSearch({ listing: stacked, query: "imani", sort: "name-asc", endings: ENDINGS });
    expect(images!.rows.map((row) => [row.name, row.variantCount, row.location])).toEqual([["imani", 2, "Portraits"]]);
  });
});
