import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { findWorkspaceText } from "../../utils/providers/findWorkspaceText";

const NEWLINE = String.fromCharCode(10);
const lines = (...text: string[]) => text.join(NEWLINE);

const MAIN = "file:///proj/main.sd";
const CHAPTER = "file:///proj/chapter.sd";
const EPILOGUE = "file:///proj/epilogue.sd";

const registry = () => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  const texts: Record<string, string> = {
    [MAIN]: lines("scene start", "  Imani: The rumour spread.", "end"),
    [CHAPTER]: lines(
      "scene chapter",
      "  RUMOUR has it, rumours fly.",
      "  A rumourmonger waits.",
      "end",
    ),
    [EPILOGUE]: lines("scene epilogue", "  Nothing more.", "end"),
  };
  for (const [uri, text] of Object.entries(texts)) {
    documents.add({
      textDocument: { uri, languageId: "sparkdown", version: 1, text },
    });
  }
  return [...documents.keys()].map((uri) => ({
    uri,
    text: documents.get(uri)!.getText(),
  }));
};

const summary = (result: ReturnType<typeof findWorkspaceText>) =>
  "error" in result
    ? result
    : {
        total: result.total,
        scripts: result.scripts.map((s) => ({
          uri: s.uri,
          at: s.matches.map(
            (m) => `${m.range.start.line}:${m.range.start.character}-${m.range.end.character}`,
          ),
        })),
      };

describe("workspace/findText over three documents", () => {
  test("finds a word in every document that holds it, ignoring case by default", () => {
    expect(summary(findWorkspaceText(registry(), { query: "rumour" }))).toEqual({
      total: 4,
      scripts: [
        { uri: MAIN, at: ["1:13-19"] },
        { uri: CHAPTER, at: ["1:2-8", "1:17-23", "2:4-10"] },
      ],
    });
  });

  test("Match case keeps only the matches written the same way", () => {
    const result = findWorkspaceText(registry(), {
      query: "RUMOUR",
      matchCase: true,
    });
    expect(summary(result)).toEqual({
      total: 1,
      scripts: [{ uri: CHAPTER, at: ["1:2-8"] }],
    });
  });

  test("Whole words drops matches inside longer words", () => {
    const result = findWorkspaceText(registry(), {
      query: "rumour",
      wholeWord: true,
    });
    expect(summary(result)).toEqual({
      total: 2,
      scripts: [
        { uri: MAIN, at: ["1:13-19"] },
        { uri: CHAPTER, at: ["1:2-8"] },
      ],
    });
  });

  test("Regular expression reads the query as a pattern", () => {
    const result = findWorkspaceText(registry(), {
      query: "rumours?\\b",
      regex: true,
    });
    expect(summary(result)).toEqual({
      total: 3,
      scripts: [
        { uri: MAIN, at: ["1:13-19"] },
        { uri: CHAPTER, at: ["1:2-8", "1:17-24"] },
      ],
    });
  });

  test("the three switches combine", () => {
    const result = findWorkspaceText(registry(), {
      query: "r\\w+",
      regex: true,
      matchCase: true,
      wholeWord: true,
    });
    expect(summary(result)).toEqual({
      total: 3,
      scripts: [
        { uri: MAIN, at: ["1:13-19"] },
        { uri: CHAPTER, at: ["1:17-24", "2:4-16"] },
      ],
    });
  });

  test("a document without a match is left out of the groups", () => {
    const result = findWorkspaceText(registry(), { query: "scene" });
    expect(summary(result)).toMatchObject({ total: 3 });
    const none = findWorkspaceText(registry(), { query: "zebra" });
    expect(none).toEqual({ total: 0, scripts: [] });
  });

  test("each match carries its line's text for the results row", () => {
    const result = findWorkspaceText(registry(), { query: "monger" });
    expect("error" in result ? [] : result.scripts[0]!.matches).toEqual([
      {
        range: {
          start: { line: 2, character: 10 },
          end: { line: 2, character: 16 },
        },
        lineText: "  A rumourmonger waits.",
      },
    ]);
  });

  test("an unreadable pattern reports the reason and no matches", () => {
    const result = findWorkspaceText(registry(), {
      query: "rumour(",
      regex: true,
    });
    expect(result).toEqual({ error: expect.any(String) });
    const literal = findWorkspaceText(registry(), { query: "rumour(" });
    expect(literal).toEqual({ total: 0, scripts: [] });
  });

  test("an empty query and a pattern that only matches nothing find nothing", () => {
    expect(findWorkspaceText(registry(), { query: "" })).toEqual({
      total: 0,
      scripts: [],
    });
    expect(
      findWorkspaceText(registry(), { query: "x*", regex: true }),
    ).toEqual({ total: 0, scripts: [] });
  });

  test("a pattern that matches nothing steps over a character outside the basic plane", () => {
    const emoji = String.fromCodePoint(0x1f600);
    const documents = [
      { uri: MAIN, text: lines("scene start", `  ${emoji} Mara waits.`, "end") },
    ];
    expect(findWorkspaceText(documents, { query: "x*", regex: true })).toEqual({
      total: 0,
      scripts: [],
    });
    const result = findWorkspaceText(documents, { query: "Mara|x*", regex: true });
    expect(summary(result)).toEqual({
      total: 1,
      scripts: [{ uri: MAIN, at: ["1:5-9"] }],
    });
  });

  test("searches a Luau script the server holds as a file, unopened, beside the Sparkdown documents", () => {
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.add({
      textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text: "scene start\nend" },
    });
    const helpers = "file:///proj/lib/helpers.luau";
    const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
    Object.assign(workspace, {
      _documents: documents,
      _documentTexts: new Map(),
      _watchedFiles: new Map([
        [MAIN, { uri: MAIN }],
        [helpers, { uri: helpers, text: 'local label = "rumour"' }],
      ]),
    });
    expect(summary(findWorkspaceText(workspace.scriptTexts(), { query: "rumour" }))).toEqual({
      total: 1,
      scripts: [{ uri: helpers, at: ["0:15-21"] }],
    });
  });

  test("a replacement is given per match, expanding groups only for patterns", () => {
    const literal = findWorkspaceText(registry(), {
      query: "rumour",
      wholeWord: true,
      replacement: "$& tale",
    });
    expect(
      "error" in literal ? [] : literal.scripts.flatMap((s) => s.matches.map((m) => m.replacement)),
    ).toEqual(["$& tale", "$& tale"]);
    const pattern = findWorkspaceText(registry(), {
      query: "(r)umour(s?)",
      regex: true,
      matchCase: true,
      replacement: "$1oar$2 $$ $9",
    });
    expect(
      "error" in pattern ? [] : pattern.scripts.flatMap((s) => s.matches.map((m) => m.replacement)),
    ).toEqual(["roar $ $9", "roars $ $9", "roar $ $9"]);
  });
});
