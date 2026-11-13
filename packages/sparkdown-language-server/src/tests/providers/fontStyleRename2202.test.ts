import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getFileRenameEdits } from "../../utils/providers/getFileRenameEdits";
import { collectReferencesForTarget } from "../../utils/providers/getReferences";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";

const ROOT = "file:///proj/";
const MAIN = `${ROOT}main.sd`;
const NEWLINE = String.fromCharCode(10);
const TEXT = ["define dialogue_text as style with", "  font_family = font.title", "end", ""].join(NEWLINE);
const FONTS = [
  `${ROOT}fonts/title.ttf`,
  `${ROOT}fonts/title@bold.ttf`,
  `${ROOT}fonts/title@italic.ttf`,
  `${ROOT}fonts/title@bolditalic.ttf`,
  `${ROOT}fonts/title__bold.ttf`,
];

const leaf = (uri: string) => uri.split("/").at(-1)!;

const setup = () => {
  const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  documents.add({ textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text: TEXT } });
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _watchedFiles: new Map([MAIN, ...FONTS].map((uri) => [uri, { uri }])),
    _programStates: new Map(),
    _documentVersions: new Map(),
    _fontFilePattern: /[.]ttf$/,
  });
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: TEXT, version: 1, languageId: "sparkdown" },
      ...FONTS.map((uri) => ({ uri, type: "font", name: leaf(uri).split(".")[0]!, ext: "ttf", src: uri, version: 1 })),
    ] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
    return { workspace, program };
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const renames = (changes: unknown[] | undefined) =>
  (changes ?? [])
    .filter((change) => typeof change === "object" && change !== null && "kind" in change && change.kind === "rename")
    .map((change) => [leaf((change as { oldUri: string }).oldUri), leaf((change as { newUri: string }).newUri)])
    .sort();

const STYLE_RENAMES = [
  ["title.ttf", "heading.ttf"],
  ["title@bold.ttf", "heading@bold.ttf"],
  ["title@bolditalic.ttf", "heading@bolditalic.ttf"],
  ["title@italic.ttf", "heading@italic.ttf"],
];

describe("font styles named with @ in the language server (#2202)", () => {
  test("renaming the font file title.ttf renames its @ style files with it, and not title__bold.ttf", () => {
    const { workspace, program } = setup();
    expect(renames(getFileRenameEdits(workspace, program, FONTS[0]!, "heading").documentChanges)).toEqual(STYLE_RENAMES);
  });

  test("renaming the family title in a script renames its @ style files with it, and not title__bold.ttf", () => {
    const { workspace, program } = setup();
    const documents = (workspace as unknown as { _documents: SparkdownDocumentRegistry })._documents;
    const edit = getRenameEdits({ editor: { autoRenameFiles: true } } as never, documents.get(MAIN), documents.tree(MAIN), program, workspace, "heading", { line: 1, character: 22 });
    expect(renames(edit?.documentChanges)).toEqual(STYLE_RENAMES);
  });

  test("references to the family title find its @ style files, and not title__bold.ttf", () => {
    const { workspace, program } = setup();
    const { references } = collectReferencesForTarget(
      program,
      workspace,
      { symbolName: "title", symbolIds: ["font.title"] },
      { searchOtherFiles: true, includeDeclaration: true, includeInterdependent: false, includeLinks: true, addAssetFiles: true },
    );
    const files = [...new Set(references.map((r) => r.uri).filter((uri) => uri !== MAIN).map(leaf))].sort();
    expect(files).toEqual(["title.ttf", "title@bold.ttf", "title@bolditalic.ttf", "title@italic.ttf"]);
  });
});
