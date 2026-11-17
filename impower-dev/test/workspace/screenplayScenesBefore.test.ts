import type { FileData } from "@impower/spark-editor-protocol/src/types";
import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../../packages/sparkdown-screenplay/src/classes/ScreenplayParser";
import ScreenplayTypesetter from "../../../packages/sparkdown-screenplay/src/classes/ScreenplayTypesetter";
import { bundleScripts } from "../../src/modules/spark-editor/workspace/utils/scriptBundle";
import { screenplayScenesBefore } from "../../src/modules/spark-editor/workspace/utils/screenplayScenesBefore";

const ROOT = "file://proj/";

const rel = (uri: string) => uri.slice(ROOT.length);

const mk = (relativePath: string, text: string): FileData => {
  const base = relativePath.split("/").slice(-1)[0]!;
  const dot = base.lastIndexOf(".");
  return {
    uri: ROOT + relativePath,
    name: base.slice(0, dot),
    ext: base.slice(dot + 1),
    type: "script",
    src: "",
    version: 0,
    languageId: "sparkdown",
    text,
  } as FileData;
};

const scene = (name: string, headings: string[]) =>
  [`scene ${name}`, ...headings.flatMap((heading) => [`  $: ${heading}`, "  Something happens."]), "end", ""].join("\n");

const FILES = [
  mk("Scripts/chapter_2.sd", scene("two", ["INT. DINER - NIGHT"])),
  mk("main.sd", scene("one", ["INT. HOUSE - DAY", "EXT. STREET - DAY"])),
  mk("Scripts/chapter_1.sd", scene("first", ["INT. PARK - DAY", "INT. ALLEY - DAY", "INT. CAR - NIGHT"])),
  mk("Scripts/epilogue.sd", scene("last", ["EXT. TRAIN - NIGHT"])),
];

const exportNumbers = () => {
  const bundle = bundleScripts(FILES, "main.sd", rel);
  return new ScreenplayTypesetter()
    .compose(new ScreenplayParser().parse(bundle))
    .flatMap((span) => ("lines" in span ? span.lines : []))
    .filter((line) => line.scene !== undefined)
    .map((line) => `${line.content.map((piece) => piece.text).join("")} ${line.scene}`);
};

const pageNumbers = (file: FileData) => {
  const before = screenplayScenesBefore(FILES, file.uri, rel);
  return new ScreenplayTypesetter()
    .compose(new ScreenplayParser().parse(file.text!), undefined, undefined, before)
    .flatMap((span) => ("lines" in span ? span.lines : []))
    .filter((line) => line.scene !== undefined)
    .map((line) => `${line.content.map((piece) => piece.text).join("")} ${line.scene}`);
};

describe("the scenes before a script", () => {
  it("number each script's headings as the export numbers them across the bundle", () => {
    const ordered = ["main.sd", "Scripts/chapter_1.sd", "Scripts/chapter_2.sd", "Scripts/epilogue.sd"];
    const page = ordered.flatMap((path) => pageNumbers(FILES.find((file) => rel(file.uri) === path)!));
    expect(page).toEqual(exportNumbers());
    expect(page.at(-1)).toBe("EXT. TRAIN - NIGHT 7");
  });

  it("count nothing before the main script", () => {
    expect(screenplayScenesBefore(FILES, `${ROOT}main.sd`, rel)).toBe(0);
  });
});
