import { describe, expect, it } from "vitest";
import {
  referencedBy,
  referencedByLabel,
} from "../../src/modules/spark-editor/utils/fileListModel";

const REFERENCES = [
  { from: "main.sd", to: "Scripts/chapter_1.sd", divert: true },
  { from: "Scripts/chapter_2.sd", to: "Scripts/chapter_1.sd", divert: false },
  { from: "main.sd", to: "Scripts/Drafts/old.sd", divert: true },
  { from: "Scripts/Drafts/notes.sd", to: "Scripts/Drafts/old.sd", divert: false },
  { from: "Scripts/chapter_1.sd", to: "Scripts/chapter_1.sd", divert: true },
  { from: "Scripts/chapter_1.sd", to: "Scripts/Definitions/types.sd", divert: false },
];

describe("the reference check that decides between the Delete dialog and the Undo toast", () => {
  it("names nothing for a script no other script references", () => {
    expect(referencedBy(REFERENCES, ["Scripts/epilogue.sd"])).toEqual([]);
    expect(referencedBy(REFERENCES, ["Scripts/chapter_2.sd"])).toEqual([]);
  });

  it("names every script that diverts to or uses the script, once each, never the script itself", () => {
    expect(referencedBy(REFERENCES, ["Scripts/chapter_1.sd"])).toEqual([
      "main.sd",
      "Scripts/chapter_2.sd",
    ]);
  });

  it("checks every script inside a folder and ignores references from inside the same deletion", () => {
    expect(referencedBy(REFERENCES, ["Scripts/Drafts"])).toEqual(["main.sd"]);
    expect(referencedBy(REFERENCES, ["Scripts/Drafts/old.sd", "Scripts/Drafts/notes.sd"])).toEqual([
      "main.sd",
    ]);
    expect(referencedBy(REFERENCES, ["Scripts/chapter_1.sd", "Scripts/chapter_2.sd"])).toEqual([
      "main.sd",
    ]);
  });

  it("does not treat a folder whose name starts the same as one inside it", () => {
    expect(referencedBy(REFERENCES, ["Scripts/Draft"])).toEqual([]);
  });

  it("reads the names it found as one sentence", () => {
    expect(referencedByLabel(["main.sd"])).toBe("Referenced by main.sd");
    expect(referencedByLabel(["main.sd", "Scripts/chapter_2.sd"])).toBe(
      "Referenced by main.sd and chapter_2.sd",
    );
    expect(referencedByLabel(["main.sd", "Scripts/a.sd", "Scripts/b.sd"])).toBe(
      "Referenced by main.sd, a.sd and b.sd",
    );
  });
});
