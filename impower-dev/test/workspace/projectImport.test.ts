import { describe, expect, it } from "vitest";
import {
  findProjectRoot,
  importOutcomeSentence,
} from "../../src/modules/spark-editor/workspace/projectImport";

describe("findProjectRoot", () => {
  it.each([
    {
      name: "a flat zip is the project",
      paths: ["main.sd", "Scripts/a.sd", "art/"],
      expected: { kind: "root", root: "", leftOut: { count: 0, folders: [] } },
    },
    {
      name: "one wrapper folder holding main.sd is the root",
      paths: ["project/", "project/main.sd", "project/Scripts/a.sd"],
      expected: {
        kind: "root",
        root: "project/",
        leftOut: { count: 0, folders: [] },
      },
    },
    {
      name: "the shallowest main.sd wins over a deeper one",
      paths: ["story/main.sd", "story/old/main.sd"],
      expected: {
        kind: "root",
        root: "story/",
        leftOut: { count: 0, folders: [] },
      },
    },
    {
      name: "files outside the root are counted by their top folder",
      paths: [
        "README.md",
        "docs/a.txt",
        "docs/b.txt",
        "outer/story/main.sd",
        "outer/notes.txt",
      ],
      expected: {
        kind: "root",
        root: "outer/story/",
        leftOut: { count: 4, folders: ["", "docs", "outer"] },
      },
    },
    {
      name: "macOS and Windows droppings never count",
      paths: [
        "__MACOSX/project/._main.sd",
        "__MACOSX/main.sd",
        ".DS_Store",
        "Thumbs.db",
        "project/main.sd",
      ],
      expected: {
        kind: "root",
        root: "project/",
        leftOut: { count: 0, folders: [] },
      },
    },
    {
      name: "two main.sd at the same depth are refused, naming the folders",
      paths: ["b/main.sd", "a/main.sd"],
      expected: {
        kind: "refused",
        reason: "several_main_scripts",
        folders: ["a", "b"],
      },
    },
    {
      name: "no main.sd is refused",
      paths: ["Scripts/a.sd", "art/"],
      expected: { kind: "refused", reason: "no_main_script" },
    },
    {
      name: "the match is case-sensitive like the editor's main script",
      paths: ["Main.sd", "project/MAIN.SD"],
      expected: { kind: "refused", reason: "no_main_script" },
    },
    {
      name: "a folder named main.sd is not the main script",
      paths: ["main.sd/", "main.sd/a.sd"],
      expected: { kind: "refused", reason: "no_main_script" },
    },
  ])("$name", ({ paths, expected }) => {
    expect(findProjectRoot(paths)).toEqual(expected);
  });
});

describe("importOutcomeSentence", () => {
  it("names the folders of a zip with several projects", () => {
    expect(
      importOutcomeSentence({
        status: "failed",
        fileName: "both.zip",
        reason: "several_main_scripts",
        folders: ["a", "b", "c"],
      }),
    ).toBe(
      "“both.zip” holds more than one project, in “a”, “b” and “c”. Zip one of them on its own. Nothing was changed.",
    );
  });

  it("says a project backup needs a main.sd", () => {
    expect(
      importOutcomeSentence({
        status: "failed",
        fileName: "assets.zip",
        reason: "no_main_script",
      }),
    ).toBe(
      "“assets.zip” has no main.sd, and a project backup needs one. Nothing was changed.",
    );
  });

  it("says how many files were left out and from where", () => {
    expect(
      importOutcomeSentence({
        status: "imported",
        fileName: "story.zip",
        leftOut: { count: 3, folders: ["", "docs"] },
      }),
    ).toBe(
      "Imported “story.zip”. Left out 3 files outside the project folder, in the zip’s top level and “docs”.",
    );
  });

  it("says nothing extra when nothing was left out", () => {
    expect(
      importOutcomeSentence({
        status: "imported",
        fileName: "story.zip",
        leftOut: { count: 0, folders: [] },
      }),
    ).toBeNull();
  });
});
