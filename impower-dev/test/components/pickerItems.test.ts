import { describe, expect, it } from "vitest";
import { lengthLabel, pickerItems } from "../../src/modules/spark-editor/components/add-panel/pickerItems";
import type { AddMenuFolders } from "../../src/modules/spark-editor/utils/addMenuFolders";

const FOLDERS: AddMenuFolders = {
  backdrop: "Backdrops",
  portrait: "Portraits",
  music: "Music",
  sound: "Sounds",
};

const file = (path: string, type = "image") => ({ path, type, src: `blob:${path}` });

const FILES = [
  file("assets/Backdrops/beach.png"),
  file("assets/Backdrops/beach@night.png"),
  file("assets/Backdrops/beach@dusk.png"),
  file("assets/art/backdrops/city/plaza.v2.jpg"),
  file("assets/Portraits/imani.png"),
  file("assets/Portraits/imani~mood.happy.png"),
  file("assets/Portraits/imani~mood.sad.png"),
  file("assets/Portraits/imani~hat.on.png"),
  file("assets/Portraits/Side/kai.png"),
  file("assets/Sounds/door.wav", "audio"),
  file("assets/Sounds/ui/click.ogg", "audio"),
  file("assets/Music/theme.mp3", "audio"),
  file("assets/Sounds/door.png"),
  file("assets/Backdrops/notes.txt", "text"),
];

const summary = (kind: Parameters<typeof pickerItems>[0]) =>
  pickerItems(kind, FILES, FOLDERS).map((item) => [item.reference, item.name, item.caption, item.src]);

describe("the pickers' cards", () => {
  it("offer a backdrop's base and then each alternate, captioned with its subfolder, at any depth and case", () => {
    expect(summary("backdrop")).toEqual([
      ["beach", "beach", "", "blob:assets/Backdrops/beach.png"],
      ["beach@dusk", "beach", "dusk", "blob:assets/Backdrops/beach@dusk.png"],
      ["beach@night", "beach", "night", "blob:assets/Backdrops/beach@night.png"],
      ["plaza", "plaza", "city", "blob:assets/art/backdrops/city/plaza.v2.jpg"],
    ]);
  });

  it("offer a portrait's base and then each option of its first group of options, never a switch", () => {
    expect(summary("portrait")).toEqual([
      ["imani", "imani", "", "blob:assets/Portraits/imani.png"],
      ["imani:happy", "imani", "happy", "blob:assets/Portraits/imani.png"],
      ["imani:sad", "imani", "sad", "blob:assets/Portraits/imani.png"],
      ["kai", "kai", "Side", "blob:assets/Portraits/Side/kai.png"],
    ]);
  });

  it("write an option with its group when the bare option could mean another group's", () => {
    const shared = [
      file("assets/Portraits/mia.png"),
      file("assets/Portraits/mia~eyes.left.png"),
      file("assets/Portraits/mia~eyes.right.png"),
      file("assets/Portraits/mia~look.left.png"),
    ];
    expect(pickerItems("portrait", shared, FOLDERS).map((item) => item.reference)).toEqual([
      "mia",
      "mia:eyes.left",
      "mia:right",
    ]);
  });

  it("offer each sound or piece of music by its name, captioned with its subfolder, and only audio", () => {
    expect(summary("sound")).toEqual([
      ["door", "door", "", "blob:assets/Sounds/door.wav"],
      ["click", "click", "ui", "blob:assets/Sounds/ui/click.ogg"],
    ]);
    expect(summary("music")).toEqual([["theme", "theme", "", "blob:assets/Music/theme.mp3"]]);
  });

  it("give every card its own id, and offer nothing from a folder the menu does not name", () => {
    const ids = (["backdrop", "portrait", "sound", "music"] as const).flatMap((kind) =>
      pickerItems(kind, FILES, FOLDERS).map((item) => item.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(pickerItems("backdrop", FILES, { ...FOLDERS, backdrop: "Places" })).toEqual([]);
  });
});

describe("a sound's length", () => {
  it("reads as minutes and two-digit seconds, rounding down", () => {
    expect([0, 2.9, 61, 600.4, -1].map(lengthLabel)).toEqual(["0:00", "0:02", "1:01", "10:00", "0:00"]);
  });
});
