import { describe, expect, it } from "vitest";
import {
  definitionOf,
  isCue,
  kindOfDefinition,
  nameRangeAt,
  textOf,
} from "../../src/modules/spark-editor/workspace/nameAtCaret";
import { stateForRoute } from "../../src/modules/spark-editor/workspace/routes";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const range = (line: number, from: number, to: number) => ({
  start: { line, character: from },
  end: { line, character: to },
});

describe("the name under the caret", () => {
  it("is a read or write highlight around the caret, never a text one", () => {
    const highlights = [
      { range: range(5, 2, 7), kind: 2 },
      { range: range(9, 0, 4), kind: 3 },
    ];
    expect(nameRangeAt(highlights, { line: 5, character: 4 })).toEqual(range(5, 2, 7));
    expect(nameRangeAt(highlights, { line: 5, character: 7 })).toEqual(range(5, 2, 7));
    expect(nameRangeAt(highlights, { line: 5, character: 8 })).toBeNull();
    expect(nameRangeAt([{ range: range(12, 2, 7), kind: 1 }], { line: 12, character: 4 })).toBeNull();
    expect(nameRangeAt(null, { line: 0, character: 0 })).toBeNull();
  });

  it("reads the name's text from the document", () => {
    expect(textOf("scene start\n  IMANI:\n", range(1, 2, 7))).toBe("IMANI");
  });

  it("takes its kind from the line that defines it, or the file it names", () => {
    expect(kindOfDefinition("file://local/main.sd", "scene the_rumour")).toBe("scene");
    expect(kindOfDefinition("file://local/main.sd", "  branch notebook")).toBe("branch");
    expect(kindOfDefinition("file://local/main.sd", "define imani as character with")).toBe("character");
    expect(kindOfDefinition("file://local/main.sd", "define night as filtered_image with")).toBe("define");
    expect(kindOfDefinition("file://local/main.sd", "store score = 0")).toBe("variable");
    expect(kindOfDefinition("file://local/main.sd", "global chapter = 1")).toBe("variable");
    expect(kindOfDefinition("file://local/sky_night.png", "")).toBe("picture");
    expect(kindOfDefinition("file://local/door_chime.mp3", "")).toBe("sound");
    expect(kindOfDefinition("file://local/notes.txt", "")).toBe("file");
  });

  it("calls a cue's name a character", () => {
    expect(isCue("  IMANI:", "IMANI")).toBe(true);
    expect(isCue("  IMANI (V.O.):", "IMANI")).toBe(true);
    expect(isCue("  Imani sorts the cards.", "Imani")).toBe(false);
  });

  it("ignores a text-kind definition the server returns for plain words", () => {
    expect(definitionOf([{ uri: "file://local/main.sd", range: range(12, 2, 7), kind: 1 }])).toBeNull();
    expect(definitionOf([{ uri: "file://local/main.sd", range: range(10, 6, 16), kind: 3 }])).toEqual({
      uri: "file://local/main.sd",
      range: range(10, 6, 16),
    });
  });
});

describe("the writing tools across routes", () => {
  it("stays open on the write route and closes on every other", () => {
    const open = {
      ...workspace.current,
      screen: { writingTools: { view: "guide" as const, fromMenu: false } },
    };
    expect(stateForRoute(open, "write").screen.writingTools).toEqual({ view: "guide", fromMenu: false });
    for (const route of ["scripts", "collection", "share", "project"] as const) {
      expect(stateForRoute(open, route).screen.writingTools).toBeUndefined();
    }
  });
});
