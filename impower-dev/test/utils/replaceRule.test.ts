import { describe, expect, it } from "vitest";
import { assetEndingsOf } from "../../src/modules/spark-editor/utils/assetTypes";
import { replacementOf } from "../../src/modules/spark-editor/utils/replaceRule";
import { PROJECT_SETTINGS_SCHEMA } from "../../src/modules/spark-editor/workspace/settings/settingsSchema";

const ENDINGS = assetEndingsOf({
  imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
  audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
  videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
  fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
});

describe("Replace's name and type rule", () => {
  it.each([
    ["a PNG over a PNG", { path: "Assets/Images/Backdrops/harbor.png", type: "image" as const }, "harbor.png"],
    ["a JPEG over a PNG keeps the old name and ending", { path: "Assets/Images/Backdrops/harbor.png", type: "image" as const }, "photo.JPG"],
    ["an MP3 over a WAV", { path: "Assets/Audio/Sounds/chime.wav", type: "audio" as const }, "bell.mp3"],
    ["a WOFF2 over a TTF", { path: "Assets/Fonts/courier_prime.ttf", type: "font" as const }, "courier.woff2"],
    ["a Markdown note over a text note", { path: "Assets/Text/notes.txt", type: "text" as const }, "notes.md"],
    ["another kind of file over another kind", { path: "Assets/Other/table.csv", type: "other" as const }, "table.json"],
  ])("accepts %s and writes it to the old path", (_name, target, chosen) => {
    expect(replacementOf(target, chosen, ENDINGS)).toEqual({ path: target.path });
  });

  it.each([
    [
      "a WAV over a PNG",
      { path: "Assets/Images/Backdrops/harbor.png", type: "image" as const },
      "ring.wav",
      "ring.wav is a sound, and harbor.png is an image. Choose an image to replace it.",
    ],
    [
      "a PNG over a WAV",
      { path: "Assets/Audio/Sounds/chime.wav", type: "audio" as const },
      "harbor.png",
      "harbor.png is an image, and chime.wav is a sound. Choose a sound to replace it.",
    ],
    [
      "a file with no ending over a font",
      { path: "Assets/Fonts/courier_prime.ttf", type: "font" as const },
      "README",
      "README is a file of another kind, and courier_prime.ttf is a font. Choose a font to replace it.",
    ],
    [
      "any file over a link",
      { path: "Assets/Images/sky.url", type: "image" as const, link: true },
      "sky.png",
      "sky.url is a link, so it has no file to replace. Change its address instead.",
    ],
  ])("refuses %s with the reason", (_name, target, chosen, reason) => {
    expect(replacementOf(target, chosen, ENDINGS)).toEqual({ refused: reason });
  });
});
