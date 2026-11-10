import {
  planInsertion,
  type InsertConstruct,
} from "@impower/codemirror-vscode-lsp-client/src/insert";
import { getName } from "../../../packages/opfs-workspace/src/utils/getName";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { endsDialogueBlock } from "@impower/sparkdown/src/compiler/utils/endsDialogueBlock";
import { describe, expect, it } from "vitest";
import { lengthLabel, pickerItems } from "../../src/modules/spark-editor/components/add-panel/pickerItems";
import {
  ADD_MENU_KINDS,
  type AddMenuFolders,
  type AddMenuKind,
} from "../../src/modules/spark-editor/utils/addMenuFolders";

const FOLDERS: AddMenuFolders = {
  backdrop: "Backdrops",
  portrait: "Portraits",
  music: "Music",
  sound: "Sounds",
};

const file = (path: string, type = "image") => ({ path, type, src: `blob:${path}` });

const FILES = [
  file("assets/Backdrops/beach.png"),
  file("assets/Backdrops/beach@night.png"),
  file("assets/Backdrops/beach@dusk.png"),
  file("assets/Backdrops/harbor@storm.png"),
  file("assets/art/BACKDROPS/city/plaza.jpg"),
  file("assets/art/backdrops/city/plaza.v2.jpg"),
  file("assets/Portraits/imani.png"),
  file("assets/Portraits/imani~mood.happy.png"),
  file("assets/Portraits/imani~mood.sad.png"),
  file("assets/Portraits/imani~hat.on.png"),
  file("assets/Portraits/kai~eyes.closed.png"),
  file("assets/Portraits/Side/mia.png"),
  file("assets/Sounds/door.wav", "audio"),
  file("assets/Sounds/ui/click.ogg", "audio"),
  file("assets/Sounds/ui/click.v2.ogg", "audio"),
  file("assets/Sounds/door knock.wav", "audio"),
  file("assets/Music/theme.mp3", "audio"),
  file("assets/Sounds/door.png"),
  file("assets/Backdrops/notes.txt", "text"),
];

const summary = (kind: AddMenuKind) =>
  pickerItems(kind, FILES, FOLDERS).map((item) => [item.reference, item.caption, item.src]);

describe("the pickers' cards", () => {
  it("offer each backdrop by its base name, captioned with its subfolder, at any depth and case", () => {
    expect(summary("backdrop")).toEqual([
      ["beach", "", "blob:assets/Backdrops/beach.png"],
      ["plaza", "city", "blob:assets/art/BACKDROPS/city/plaza.jpg"],
    ]);
  });

  it("offer no alternate, no thing without a base picture, and no file whose name a script cannot write", () => {
    const references = ADD_MENU_KINDS.flatMap((kind) => pickerItems(kind, FILES, FOLDERS).map((item) => item.reference));
    expect(references.filter((reference) => /[@~. ]|^(harbor|kai)$/.test(reference))).toEqual([]);
  });

  it("offer each portrait by its base name, without its layer options", () => {
    expect(summary("portrait")).toEqual([
      ["imani", "", "blob:assets/Portraits/imani.png"],
      ["mia", "Side", "blob:assets/Portraits/Side/mia.png"],
    ]);
  });

  it("offer each sound or piece of music by its name, captioned with its subfolder, and only audio", () => {
    expect(summary("sound")).toEqual([
      ["door", "", "blob:assets/Sounds/door.wav"],
      ["click", "ui", "blob:assets/Sounds/ui/click.ogg"],
    ]);
    expect(summary("music")).toEqual([["theme", "", "blob:assets/Music/theme.mp3"]]);
  });

  it("give every card its own id, and offer nothing from a folder the menu does not name", () => {
    const ids = ADD_MENU_KINDS.flatMap((kind) => pickerItems(kind, FILES, FOLDERS).map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(pickerItems("backdrop", FILES, { ...FOLDERS, backdrop: "Places" })).toEqual([]);
  });
});

const LF = String.fromCharCode(10);
const MAIN_URI = "file:///main.sd";
const SCRIPT = ["scene start", "  Hello.", "end", ""].join(LF);
const CONSTRUCTS: Record<AddMenuKind, InsertConstruct> = {
  backdrop: "backdrop",
  portrait: "portrait",
  music: "music",
  sound: "sound",
};

const inserted = (construct: InsertConstruct, name: string) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({ textDocument: { uri: MAIN_URI, text: SCRIPT, version: 1, languageId: "sparkdown" } });
  const plan = planInsertion(
    SCRIPT,
    SCRIPT.indexOf("Hello."),
    construct,
    {
      scenes: [{ startLine: 0, endLine: 2 }],
      branches: [],
      tree: documents.tree(MAIN_URI)!,
      endsDialogue: endsDialogueBlock,
    },
    name,
  )!;
  return SCRIPT.slice(0, plan.from) + plan.insert + SCRIPT.slice(plan.to);
};

const diagnosticsOf = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN_URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...FILES.filter(({ type }) => type === "image" || type === "audio").map(({ path, type, src }) => ({
        uri: `file:///${path}`,
        type,
        name: getName(path),
        ext: path.slice(path.lastIndexOf(".") + 1),
        src,
      })),
    ] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    const { program } = compiler.compile({ textDocument: { uri: MAIN_URI } });
    return (program.diagnostics?.[MAIN_URI] ?? []).map((diagnostic) =>
      typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value,
    );
  } finally {
    Object.assign(console, { warn, error, log });
  }
};

describe("what the pickers insert", () => {
  it("compiles with no diagnostic for every card the pickers offer", () => {
    expect(diagnosticsOf(SCRIPT)).toEqual([]);
    const problems = ADD_MENU_KINDS.flatMap((kind) =>
      pickerItems(kind, FILES, FOLDERS).flatMap((item) => {
        const text = inserted(CONSTRUCTS[kind], item.reference);
        return diagnosticsOf(text).map((message) => `${kind} ${item.reference}: ${message}`);
      }),
    );
    expect(problems).toEqual([]);
  });
});

describe("a sound's length", () => {
  it("reads as minutes and two-digit seconds, rounding down", () => {
    expect([0, 2.9, 61, 600.4, -1].map(lengthLabel)).toEqual(["0:00", "0:02", "1:01", "10:00", "0:00"]);
  });
});
