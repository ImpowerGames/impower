import { describe, expect, it } from "vitest";
import {
  INTO_ITSELF,
  MAIN_STAYS,
  moveCheck,
  type ScriptListing,
} from "../../src/modules/spark-editor/workspace/scriptsListing";

const facts = { modified: 0, size: 0 };
const LISTING: ScriptListing = {
  files: {
    "main.sd": facts,
    "Scripts/intro.sd": facts,
    "Scripts/outro.sd": facts,
    "Scripts/Drafts/old.sd": facts,
    "Scripts/Drafts/Old/older.sd": facts,
  },
  folders: ["Scripts", "Scripts/Drafts", "Scripts/Drafts/Old", "Scripts/Empty"],
};

describe("the drop and Move validation", () => {
  it("moves a script dropped onto another folder", () => {
    expect(moveCheck(LISTING, ["Scripts/intro.sd"], "Scripts/Drafts")).toEqual({
      moving: ["Scripts/intro.sd"],
    });
  });

  it("does nothing for a drop onto the folder an item is already in, the browser root standing for Scripts", () => {
    expect(moveCheck(LISTING, ["Scripts/intro.sd"], "")).toEqual({ moving: [] });
    expect(moveCheck(LISTING, ["Scripts/Drafts/old.sd"], "Scripts/Drafts")).toEqual({ moving: [] });
  });

  it("refuses a folder dropped into itself or into a folder inside it", () => {
    expect(moveCheck(LISTING, ["Scripts/Drafts"], "Scripts/Drafts")).toEqual({ refused: INTO_ITSELF });
    expect(moveCheck(LISTING, ["Scripts/Drafts"], "Scripts/Drafts/Old")).toEqual({ refused: INTO_ITSELF });
    expect(moveCheck(LISTING, ["Scripts/intro.sd", "Scripts/Drafts"], "Scripts/Drafts/Old")).toEqual({
      refused: INTO_ITSELF,
    });
  });

  it("refuses Main", () => {
    expect(moveCheck(LISTING, ["main.sd"], "Scripts/Drafts")).toEqual({ refused: MAIN_STAYS });
  });

  it("moves a picked folder once, carrying what it holds rather than moving its picked contents again", () => {
    expect(
      moveCheck(LISTING, ["Scripts/Drafts", "Scripts/Drafts/old.sd", "Scripts/outro.sd"], "Scripts/Empty"),
    ).toEqual({ moving: ["Scripts/Drafts", "Scripts/outro.sd"] });
  });
});
