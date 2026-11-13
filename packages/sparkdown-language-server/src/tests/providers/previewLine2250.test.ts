import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getPreviewLine } from "../../utils/providers/getPreviewLine";

const URI = "file:///main.sd";

const previewOf = (source: string) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  const document = documents.get(URI)!;
  const tree = documents.tree(URI)!;
  return (line: number) => getPreviewLine(document, tree, line);
};

const SCRIPT = `---
title: Sample
---
define harbor with
  color = "blue"
end
include "other.sd"
store trust = 0
// a note to self

^: THE MIDNIGHT JUKEBOX
$: INT. IMANI'S HOUSE - LOUNGE - MORNING
%: CUT TO:

scene interrogation
  Imani sorts *index cards* into neat piles.
  INSPECTOR:
    [[imani:happy]]
    Where were _you_ at nine?
  ZADIE: You are *not* going to believe this.
  choose
    Where now?
    * [Tell the truth.]
      trust += 2
    * [Lie.]
      You lie badly.
  end
  branch storm
    The rain comes down.
  end
end

scene quiet
end
`;

describe("the caret line's preview record", () => {
  const at = previewOf(SCRIPT);

  test("names the kind of each display line and its words without markers", () => {
    expect(at(10)).toEqual({ kind: "title", line: 10, words: "THE MIDNIGHT JUKEBOX" });
    expect(at(11)).toEqual({
      kind: "heading",
      line: 11,
      words: "INT. IMANI'S HOUSE - LOUNGE - MORNING",
    });
    expect(at(12)).toEqual({ kind: "transition", line: 12, words: "CUT TO:" });
    expect(at(15)).toEqual({
      kind: "action",
      line: 15,
      words: "Imani sorts index cards into neat piles.",
    });
  });

  test("gives a dialogue line's speaker for a cue block and for one-line dialogue", () => {
    const spoken = {
      kind: "dialogue",
      line: 18,
      words: "Where were you at nine?",
      speaker: "INSPECTOR",
    };
    expect(at(16)).toEqual(spoken);
    expect(at(17)).toEqual(spoken);
    expect(at(18)).toEqual(spoken);
    expect(at(19)).toEqual({
      kind: "dialogue",
      line: 19,
      words: "You are not going to believe this.",
      speaker: "ZADIE",
    });
  });

  test("gives a choose block's question on its question and option lines", () => {
    const choice = { kind: "choice", line: 20, words: "Where now?" };
    for (const line of [20, 21, 22, 24, 26]) {
      expect(at(line)).toEqual(choice);
    }
    expect(at(25)).toEqual({ kind: "action", line: 25, words: "You lie badly." });
  });

  test("shows the first beat inside a scene or branch declaration", () => {
    expect(at(14)).toEqual(at(15));
    expect(at(27)).toEqual({ kind: "action", line: 28, words: "The rain comes down." });
  });

  test("calls front matter, definitions, includes, stored values and comments setup", () => {
    for (const line of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(at(line)).toEqual({ kind: "setup" });
    }
  });

  test("calls a scene with nothing to show, and an empty script, empty", () => {
    expect(at(32)).toEqual({ kind: "empty" });
    expect(at(33)).toEqual({ kind: "empty" });
    expect(previewOf("")(0)).toEqual({ kind: "empty" });
  });

  test("calls a comment line inside a dialogue or action block setup, and leaves the lines around it to their beat", () => {
    const nested = previewOf(
      [
        "scene start",
        "  ALICE:",
        "    Hello.",
        "    // A note for the author.",
        "    Goodbye.",
        "  :",
        "    The room is quiet.",
        "    /* A stage note. */",
        "    The door opens.",
        "end",
      ].join("\n"),
    );
    expect(nested(3)).toEqual({ kind: "setup" });
    expect(nested(7)).toEqual({ kind: "setup" });
    expect(nested(4)).toEqual({
      kind: "dialogue",
      line: 2,
      words: "Hello. Goodbye.",
      speaker: "ALICE",
    });
    expect(nested(8)).toEqual({
      kind: "action",
      line: 6,
      words: "The room is quiet. The door opens.",
    });
  });

  test("shows the beat a block's line belongs to, a break mark ending one beat and starting the next", () => {
    const blocks = previewOf(
      [
        "scene start",
        "  ALICE:",
        "    Hello. >",
        "    Goodbye.",
        "    And more.",
        "  :",
        "    The room is quiet. >",
        "    The door opens.",
        "  BOB:",
        "    /* aside */ Bye /* mid */ now. // trailing",
        "end",
      ].join("\n"),
    );
    expect(blocks(1)).toEqual({ kind: "dialogue", line: 2, words: "Hello.", speaker: "ALICE" });
    expect(blocks(2)).toEqual({ kind: "dialogue", line: 2, words: "Hello.", speaker: "ALICE" });
    for (const line of [3, 4]) {
      expect(blocks(line)).toEqual({
        kind: "dialogue",
        line: 3,
        words: "Goodbye. And more.",
        speaker: "ALICE",
      });
    }
    expect(blocks(6)).toEqual({ kind: "action", line: 6, words: "The room is quiet." });
    expect(blocks(7)).toEqual({ kind: "action", line: 7, words: "The door opens." });
    expect(blocks(9)).toEqual({ kind: "dialogue", line: 9, words: "Bye now.", speaker: "BOB" });
  });

  test("keeps a branch's beats inside the branch and resumes the enclosing scene after its end", () => {
    const nested = previewOf(
      [
        "scene start",
        "  Outer.",
        "  branch nested",
        "    Inner.",
        "  end",
        "  x = 1",
        "",
        "  After.",
        "end",
        "",
        "scene opens_on_a_branch",
        "  branch first",
        "  end",
        "  Outer again.",
        "end",
      ].join("\n"),
    );
    const outer = { kind: "action", line: 1, words: "Outer." };
    expect(nested(5)).toEqual(outer);
    expect(nested(6)).toEqual(outer);
    expect(nested(2)).toEqual({ kind: "action", line: 3, words: "Inner." });
    expect(nested(9)).toEqual({ kind: "empty" });
    expect(nested(10)).toEqual({ kind: "action", line: 13, words: "Outer again." });
    expect(nested(11)).toEqual({ kind: "empty" });
  });

  test("captions a choose block with its last beat before the options, as the outline does, and keeps earlier beats apart", () => {
    const menu = previewOf(
      [
        "scene start",
        "  choose",
        "    First question. >",
        "    Second question.",
        "    * [Yes.]",
        "      You agree.",
        "    * [No.]",
        "  then",
        "    After the menu.",
        "  end",
        "end",
      ].join("\n"),
    );
    const choice = { kind: "choice", line: 1, words: "Second question." };
    for (const line of [1, 3, 4, 6, 9]) {
      expect(menu(line)).toEqual(choice);
    }
    expect(menu(0)).toEqual({ kind: "action", line: 2, words: "First question." });
    expect(menu(2)).toEqual({ kind: "action", line: 2, words: "First question." });
    expect(menu(5)).toEqual({ kind: "action", line: 5, words: "You agree." });
    expect(menu(8)).toEqual({ kind: "action", line: 8, words: "After the menu." });
    expect(menu(10)).toEqual({ kind: "action", line: 8, words: "After the menu." });
  });

  test("keeps the earlier beats of a caption block apart from the choice it captions", () => {
    const menu = previewOf(
      [
        "scene start",
        "  choose",
        "    ALICE:",
        "      Listen carefully. >",
        "      Will you help?",
        "    * [Yes.]",
        "  end",
        "end",
      ].join("\n"),
    );
    const listen = { kind: "dialogue", line: 3, words: "Listen carefully.", speaker: "ALICE" };
    expect(menu(2)).toEqual(listen);
    expect(menu(3)).toEqual(listen);
    expect(menu(0)).toEqual(listen);
    const choice = { kind: "choice", line: 1, words: "Will you help?" };
    for (const line of [1, 4, 5, 6]) {
      expect(menu(line)).toEqual(choice);
    }
  });

  test("starts a caption's last beat at its break mark, so a command before the question's words belongs to the choice", () => {
    for (const breakLine of ["      Listen carefully. >", "      Listen carefully. > // aside"]) {
      const menu = previewOf(
        [
          "scene start",
          "  choose",
          "    ALICE:",
          breakLine,
          "      [[mia]]",
          "      Will you help?",
          "    * [Yes.]",
          "      Thank you.",
          "  end",
          "end",
        ].join("\n"),
      );
      const listen = { kind: "dialogue", line: 3, words: "Listen carefully.", speaker: "ALICE" };
      expect(menu(2)).toEqual(listen);
      expect(menu(3)).toEqual(listen);
      const choice = { kind: "choice", line: 1, words: "Will you help?" };
      for (const line of [1, 4, 5, 6, 8]) {
        expect(menu(line)).toEqual(choice);
      }
    }
  });

  test("shows the beat a line of logic follows", () => {
    expect(at(23)).toEqual({ kind: "choice", line: 20, words: "Where now?" });
    expect(previewOf("scene a\n  Hello.\n  x = 1\nend\n")(2)).toEqual({
      kind: "action",
      line: 1,
      words: "Hello.",
    });
  });
});
