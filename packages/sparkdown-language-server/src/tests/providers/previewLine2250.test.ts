import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { answerPreviewLine } from "../../utils/providers/answerPreviewLine";
import { getPreviewLine } from "../../utils/providers/getPreviewLine";

const URI = "file:///main.sd";

const OTHER = "file:///other.sd";

const registryOf = (files: Record<string, string>) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  for (const [uri, text] of Object.entries(files)) {
    documents.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  }
  return documents;
};

const previewOf = (source: string) => {
  const documents = registryOf({ [URI]: source });
  const document = documents.get(URI)!;
  const tree = documents.tree(URI)!;
  const lines = source.split("\n");
  const shownAt = (line: number, words?: string) => {
    const text = lines[line] ?? "";
    const character = words != null ? text.indexOf(words) : text.search(/\S|$/);
    return getPreviewLine(document, tree, line, { line, character });
  };
  const nothingShownAt = (line: number) => getPreviewLine(document, tree, line, null);
  return { shownAt, nothingShownAt };
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
end

scene quiet
end
`;

describe("the preview line request", () => {
  const SCENE = "scene start\n  Hello.\nend\n";
  const sourceOf = (files: Record<string, string>) => {
    const documents = registryOf(files);
    return {
      document: (uri: string) => documents.get(uri),
      tree: (uri: string) => documents.tree(uri),
    };
  };
  const at = (uri: string, line: number, character: number) => ({
    uri,
    range: { start: { line, character }, end: { line, character } },
  });

  test("describes the beat the game displays", () => {
    expect(
      answerPreviewLine(sourceOf({ [URI]: SCENE }), {
        textDocument: { uri: URI },
        line: 0,
        shownBeat: at(URI, 1, 2),
      }),
    ).toEqual({ kind: "action", words: "Hello." });
  });

  test("describes a displayed beat from the document it was written in", () => {
    expect(
      answerPreviewLine(
        sourceOf({ [URI]: "scene start\n  -> elsewhere\nend\n", [OTHER]: "scene elsewhere\n  Arrived.\nend\n" }),
        { textDocument: { uri: URI }, line: 1, shownBeat: at(OTHER, 1, 2) },
      ),
    ).toEqual({ kind: "action", words: "Arrived." });
  });

  test("names no beat while the game displays none", () => {
    expect(
      answerPreviewLine(sourceOf({ [URI]: SCENE }), {
        textDocument: { uri: URI },
        line: 1,
        shownBeat: null,
      }),
    ).toEqual({ kind: "empty" });
  });

  test("answers nothing for a document it does not hold", () => {
    expect(
      answerPreviewLine(sourceOf({ [URI]: SCENE }), {
        textDocument: { uri: URI },
        line: 1,
        shownBeat: at(OTHER, 1, 2),
      }),
    ).toBeNull();
  });
});

describe("the displayed beat's preview record", () => {
  const { shownAt, nothingShownAt } = previewOf(SCRIPT);

  test("names the kind of each display line and its words without markers", () => {
    const shown = previewOf(
      [
        "scene start",
        "  ^: THE MIDNIGHT JUKEBOX",
        "  $: INT. IMANI'S HOUSE - LOUNGE - MORNING",
        "  %: CUT TO:",
        "end",
      ].join("\n"),
    ).shownAt;
    expect(shown(1)).toEqual({ kind: "title", words: "THE MIDNIGHT JUKEBOX" });
    expect(shown(2)).toEqual({
      kind: "heading",
      words: "INT. IMANI'S HOUSE - LOUNGE - MORNING",
    });
    expect(shown(3)).toEqual({ kind: "transition", words: "CUT TO:" });
    expect(shownAt(15)).toEqual({
      kind: "action",
      words: "Imani sorts index cards into neat piles.",
    });
  });

  test("gives a dialogue beat's speaker for a cue block and for one-line dialogue", () => {
    expect(shownAt(18)).toEqual({
      kind: "dialogue",
      words: "Where were you at nine?",
      speaker: "INSPECTOR",
    });
    expect(shownAt(19, "You are")).toEqual({
      kind: "dialogue",
      words: "You are not going to believe this.",
      speaker: "ZADIE",
    });
  });

  test("gives a choose block's question for its caption and an option's response as its own beat", () => {
    expect(shownAt(21)).toEqual({ kind: "choice", words: "Where now?" });
    expect(shownAt(25)).toEqual({ kind: "action", words: "You lie badly." });
  });

  test("gives a menu without a caption its options", () => {
    const menu = previewOf(
      ["scene start", "  choose", "    * [North.]", "    * [South.]", "  end", "end"].join("\n"),
    ).shownAt;
    expect(menu(2)).toEqual({ kind: "choice", words: "North. · South." });
  });

  test("calls front matter, definitions, includes, stored values and comments setup", () => {
    for (const line of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(nothingShownAt(line)).toEqual({ kind: "setup" });
    }
  });

  test("calls every definition the compiler counts as a declaration setup, layouts and morphs included", () => {
    for (const definition of [
      'layout main {\n  content {\n    text = "Hi"\n  }\n}',
      "morph blink {\n  fallback = fade\n}",
    ]) {
      const lines = previewOf(`${definition}\n\nscene start\n  Hello.\nend\n`).nothingShownAt;
      expect(lines(0), definition).toEqual({ kind: "setup" });
      expect(lines(1), definition).toEqual({ kind: "setup" });
    }
  });

  test("calls any other line empty while the game displays nothing", () => {
    for (const line of [10, 11, 12, 15, 21, 27, 28]) {
      expect(nothingShownAt(line)).toEqual({ kind: "empty" });
    }
    expect(previewOf("").nothingShownAt(0)).toEqual({ kind: "empty" });
  });

  test("describes a block's beat whole across a comment line inside it", () => {
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
    ).shownAt;
    expect(nested(2)).toEqual({
      kind: "dialogue",
      words: "Hello. Goodbye.",
      speaker: "ALICE",
    });
    expect(nested(6)).toEqual({
      kind: "action",
      words: "The room is quiet. The door opens.",
    });
  });

  test("describes the beat a break mark ends apart from the one it starts", () => {
    const blocks = previewOf(
      [
        "scene start",
        "  ALICE:",
        "    Hello. >",
        "    Goodbye.",
        "    And more.",
        "  :",
        "    The room is quiet. > The door opens.",
        "  BOB:",
        "    /* aside */ Bye /* mid */ now. // trailing",
        "end",
      ].join("\n"),
    ).shownAt;
    expect(blocks(2)).toEqual({ kind: "dialogue", words: "Hello.", speaker: "ALICE" });
    expect(blocks(3)).toEqual({
      kind: "dialogue",
      words: "Goodbye. And more.",
      speaker: "ALICE",
    });
    expect(blocks(6, "The room")).toEqual({ kind: "action", words: "The room is quiet." });
    expect(blocks(6, "The door")).toEqual({ kind: "action", words: "The door opens." });
    expect(blocks(8, "Bye")).toEqual({ kind: "dialogue", words: "Bye now.", speaker: "BOB" });
  });

  test("keeps the earlier beats of a caption block apart from the choice it captions", () => {
    for (const breakLine of [
      "      Listen carefully. >",
      "      Listen carefully. > // aside",
      "      Listen carefully. > ..",
    ]) {
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
      ).shownAt;
      expect(menu(3), breakLine).toEqual({
        kind: "dialogue",
        words: "Listen carefully.",
        speaker: "ALICE",
      });
      expect(menu(5), breakLine).toEqual({ kind: "choice", words: "Will you help?" });
      expect(menu(7), breakLine).toEqual({ kind: "action", words: "Thank you." });
    }
  });
});
