import { describe, expect, it } from "vitest";
import {
  addMenuFiles,
  addMenuFolderProblem,
  addMenuKindOf,
  type AddMenuFolders,
} from "../../src/modules/spark-editor/utils/addMenuFolders";

const FOLDERS: AddMenuFolders = {
  backdrop: "Backdrops",
  portrait: "Portraits",
  music: "Music",
  sound: "Sounds",
};

const FILES = [
  { path: "assets/Backdrops/beach.png", type: "image" },
  { path: "Assets/Images/backdrops/city/night.jpg", type: "image" },
  { path: "assets/Backdrops/Portraits/imani.png", type: "image" },
  { path: "assets/Images/Places/harbor.png", type: "image" },
  { path: "assets/Backdrops/readme.txt", type: "text" },
  { path: "assets/Music/theme.ogg", type: "audio" },
  { path: "assets/Music/cover.png", type: "image" },
  { path: "assets/Sounds/door.wav", type: "audio" },
  { path: "scripts/Backdrops/notes.png", type: "image" },
  { path: "Backdrops/loose.png", type: "image" },
  { path: "assets/beach.png", type: "image" },
];

const paths = (kind: Parameters<typeof addMenuFiles>[1], folders = FOLDERS) =>
  addMenuFiles(FILES, kind, folders).map((file) => file.path);

describe("the Add menu's folders", () => {
  it("find a picker's files in a folder of its name at any depth under assets, in any case, of its kind of file", () => {
    expect(paths("backdrop")).toEqual(["assets/Backdrops/beach.png", "Assets/Images/backdrops/city/night.jpg"]);
    expect(paths("music")).toEqual(["assets/Music/theme.ogg"]);
    expect(paths("sound")).toEqual(["assets/Sounds/door.wav"]);
  });

  it("let the nearest folder with one of the names decide", () => {
    expect(paths("portrait")).toEqual(["assets/Backdrops/Portraits/imani.png"]);
    expect(addMenuKindOf({ path: "assets/Portraits/Backdrops/x.png", type: "image" }, FOLDERS)).toBe("backdrop");
  });

  it("follow a renamed folder", () => {
    expect(paths("backdrop", { ...FOLDERS, backdrop: "Places" })).toEqual(["assets/Images/Places/harbor.png"]);
  });

  it("refuse an empty name or one with a slash, and accept any other", () => {
    expect(addMenuFolderProblem("")).toBe("A folder name can't be empty");
    expect(addMenuFolderProblem("   ")).toBe("A folder name can't be empty");
    expect(addMenuFolderProblem("Images/Places")).toBe("A folder name can't contain a slash");
    expect(addMenuFolderProblem("Images\\Places")).toBe("A folder name can't contain a slash");
    expect(addMenuFolderProblem(" Places ")).toBeUndefined();
  });
});
