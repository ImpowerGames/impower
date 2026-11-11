import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getFileRenameEdits } from "../../utils/providers/getFileRenameEdits";

const ROOT = "file:///proj/";
const MAIN = `${ROOT}main.sd`;
const NEWLINE = String.fromCharCode(10);
const TEXT = ["scene start", "  [[show portrait imani~face.happy]]", "end", ""].join(NEWLINE);

const leaf = (uri: string) => uri.split("/").at(-1)!;

const setup = (images: string[]) => {
  const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  documents.add({ textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text: TEXT } });
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _watchedFiles: new Map([MAIN, ...images].map((uri) => [uri, { uri }])),
    _programStates: new Map(),
    _documentVersions: new Map(),
    _imageFilePattern: /[.]png$/,
  });
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: TEXT, version: 1, languageId: "sparkdown" },
      ...images.map((uri) => ({ uri, type: "image", name: leaf(uri).split(".")[0]!, ext: "png", src: uri, version: 1 })),
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

const renames = (edit: ReturnType<typeof getFileRenameEdits>) =>
  (edit.documentChanges ?? [])
    .filter((change) => "kind" in change && change.kind === "rename")
    .map((change) => [leaf((change as { oldUri: string }).oldUri), leaf((change as { newUri: string }).newUri)]);

describe("renaming a picture's file name", () => {
  test("keeps everything after the name, so a layer file keeps its option and extension", () => {
    const happy = `${ROOT}imani~face.happy.png`;
    const sad = `${ROOT}imani~face.sad.png`;
    const { workspace, program } = setup([`${ROOT}imani.png`, happy, sad]);
    expect(renames(getFileRenameEdits(workspace, program, happy, "zadie~face"))).toEqual([
      ["imani~face.happy.png", "zadie~face.happy.png"],
      ["imani~face.sad.png", "zadie~face.sad.png"],
    ]);
  });

  test("still renames a plain picture to the new name and its extension", () => {
    const { workspace, program } = setup([`${ROOT}imani.png`]);
    expect(renames(getFileRenameEdits(workspace, program, `${ROOT}imani.png`, "zadie"))).toEqual([
      ["imani.png", "zadie.png"],
    ]);
  });
});
