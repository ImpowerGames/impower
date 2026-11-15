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

const linesOf = (source: string) => {
  const documents = registryOf({ [URI]: source });
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

  test("classifies the caret's line", () => {
    expect(
      answerPreviewLine(sourceOf({ [URI]: SCENE }), { textDocument: { uri: URI }, line: 1 }),
    ).toEqual({ kind: "empty" });
    expect(
      answerPreviewLine(sourceOf({ [URI]: `store x = 0\n${SCENE}` }), {
        textDocument: { uri: URI },
        line: 0,
      }),
    ).toEqual({ kind: "setup" });
  });

  test("answers nothing for a document it does not hold", () => {
    expect(
      answerPreviewLine(sourceOf({ [URI]: SCENE }), { textDocument: { uri: OTHER }, line: 1 }),
    ).toBeNull();
  });
});

describe("the line the strip labels while the game displays nothing", () => {
  const lineAt = linesOf(SCRIPT);

  test("calls front matter, definitions, includes, stored values and comments setup", () => {
    for (const line of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(lineAt(line), `line ${line}`).toEqual({ kind: "setup" });
    }
  });

  test("calls every definition the compiler counts as a declaration setup, layouts and morphs included", () => {
    for (const definition of [
      'layout main {\n  content {\n    text = "Hi"\n  }\n}',
      "morph blink {\n  fallback = fade\n}",
    ]) {
      const lines = linesOf(`${definition}\n\nscene start\n  Hello.\nend\n`);
      expect(lines(0), definition).toEqual({ kind: "setup" });
      expect(lines(1), definition).toEqual({ kind: "setup" });
    }
  });

  test("calls any other line empty", () => {
    for (const line of [9, 10, 11, 12, 15, 17, 18, 19, 21, 23, 25, 27, 28]) {
      expect(lineAt(line), `line ${line}`).toEqual({ kind: "empty" });
    }
    expect(linesOf("")(0)).toEqual({ kind: "empty" });
  });
});
