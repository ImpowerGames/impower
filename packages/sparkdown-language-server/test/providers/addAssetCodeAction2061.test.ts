import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../src/classes/SparkdownLanguageServerWorkspace";
import {
  getCodeActions,
  getDiagnosticActions,
} from "../../src/utils/providers/getCodeActions";

const MAIN = "file:///proj/main.sd";
const NEWLINE = String.fromCharCode(10);

const lines = (...text: string[]) => text.join(NEWLINE);

const asset = (type: string, ext: string) => (name: string) => ({
  uri: `file:///proj/assets/${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/local/assets/${name}.${ext}`,
});

const compile = (
  main: string,
  assets: ReturnType<ReturnType<typeof asset>>[] = [],
): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: main,
        version: 1,
        languageId: "sparkdown",
      },
      ...assets,
    ] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return compiler.compile({ textDocument: { uri: MAIN } }).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const messageOf = (d: { message: string | { value: string } }) =>
  typeof d.message === "string" ? d.message : d.message.value;

const cannotFind = (program: SparkProgram) =>
  (program.diagnostics?.[MAIN] ?? []).filter((d) =>
    messageOf(d).startsWith("Cannot find"),
  ) as Diagnostic[];

const actionsFor = (text: string, diagnostics: Diagnostic[]) =>
  getCodeActions(TextDocument.create(MAIN, "sparkdown", 1, text), diagnostics);

const addAsset = (name: string, type: string) => ({
  title: `Add ${name} to assets`,
  command: "sparkdown.addAsset",
  arguments: [{ name, type }],
});

const play = (name: string) =>
  lines("scene start", `  ((play sound ${name}))`, "  Hello.", "end", "");

const show = (name: string) =>
  lines("scene start", `  [[show portrait ${name}]]`, "  Hello.", "end", "");

describe("the Add to assets quick fix", () => {
  test("offers a command, not an edit, for a missing sound", () => {
    const text = play("boom");
    const diagnostics = cannotFind(compile(text));
    expect(diagnostics.map(messageOf)).toEqual(["Cannot find audio named `boom`"]);
    const actions = actionsFor(text, diagnostics);
    expect(actions.map(({ title, kind, edit, command }) => ({ title, kind, edit, command }))).toEqual([
      {
        title: "Add boom to assets",
        kind: "quickfix",
        edit: undefined,
        command: addAsset("boom", "audio"),
      },
    ]);
    expect(actions[0]!.diagnostics).toEqual([diagnostics[0]]);
  });

  test("sits after the close-match fix, which stays preferred", () => {
    const text = show("alcie");
    const image = asset("image", "png");
    const diagnostics = cannotFind(compile(text, [image("alice"), image("bob")]));
    expect(diagnostics.map(messageOf)).toEqual(["Cannot find image named `alcie`"]);
    expect(
      actionsFor(text, diagnostics).map(({ title, isPreferred, command }) => ({
        title,
        isPreferred,
        command,
      })),
    ).toEqual([
      { title: "Use alice instead", isPreferred: true, command: undefined },
      { title: "Add alcie to assets", isPreferred: false, command: addAsset("alcie", "image") },
    ]);
  });

  test("names the image type for a typed asset name in a define", () => {
    const text = lines(
      "First beat.",
      "",
      "define warm as filtered_image with",
      "  image = image.backdrp",
      "end",
      "",
    );
    const diagnostics = cannotFind(compile(text));
    expect(diagnostics.map(messageOf)).toEqual(["Cannot find image named `backdrp`"]);
    expect(actionsFor(text, diagnostics).map((action) => action.command)).toEqual([
      addAsset("backdrp", "image"),
    ]);
  });

  test("reaches the web editor's diagnostic actions as a command with no edit", () => {
    const text = play("boom");
    const [diagnostic] = cannotFind(compile(text));
    expect(
      getDiagnosticActions(TextDocument.create(MAIN, "sparkdown", 1, text), diagnostic!),
    ).toEqual([
      {
        name: "Add boom to assets",
        command: { command: "sparkdown.addAsset", arguments: [{ name: "boom", type: "audio" }] },
      },
    ]);
  });

  test("carries the root of the project that reported the problem", () => {
    const text = play("boom");
    const document = TextDocument.create(MAIN, "sparkdown", 1, text);
    const [diagnostic] = cannotFind(compile(text));
    expect(getCodeActions(document, [diagnostic!], undefined, "file:///proj/")[0]!.command).toEqual({
      title: "Add boom to assets",
      command: "sparkdown.addAsset",
      arguments: [{ name: "boom", type: "audio", root: "file:///proj/" }],
    });
    expect(getDiagnosticActions(document, diagnostic!, undefined, "file:///proj/")).toEqual([
      {
        name: "Add boom to assets",
        command: {
          command: "sparkdown.addAsset",
          arguments: [{ name: "boom", type: "audio", root: "file:///proj/" }],
        },
      },
    ]);
  });

  test("takes that root from the entry of the program the script was compiled in", () => {
    const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
    const scene = "file:///proj/Game/scenes/intro.sd";
    const draft = "file:///proj/.drafts/draft.sd";
    expect(workspace.projectRootOf(scene, { uri: "file:///proj/Game/main.sd" } as SparkProgram)).toBe("file:///proj/Game/");
    expect(workspace.projectRootOf(draft, { uri: draft } as SparkProgram)).toBe("file:///proj/.drafts/");
  });

  test("is not offered for a Cannot find that names no asset", () => {
    const text = lines("layout s {", "  button @click=go", "}", "");
    const diagnostics = cannotFind(compile(text));
    expect(diagnostics.map(messageOf)).toEqual([
      expect.stringMatching(/^Cannot find function `go`/),
    ]);
    expect(actionsFor(text, diagnostics)).toEqual([]);
  });
});
