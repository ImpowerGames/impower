import {
  planInsertion,
  type InsertConstruct,
} from "@impower/codemirror-vscode-lsp-client/src/insert";
import { getName } from "../../../packages/opfs-workspace/src/utils/getName";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { endsDialogueBlock } from "@impower/sparkdown/src/compiler/utils/endsDialogueBlock";
import { describe, expect, it } from "vitest";
import {
  lengthLabel,
  pickerItems,
  pickerLeftOut,
} from "../../src/modules/spark-editor/components/add-panel/pickerItems";
import {
  ADD_MENU_FILE_TYPES,
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

const KEYWORDS = [
  "show", "hide", "play", "stop", "fade", "queue", "await", "animate", "set",
  "music", "sound", "backdrop", "portrait", "loop", "with", "after", "over", "now", "wait", "ease",
  "to", "once", "mute", "unmute", "open", "close", "navigate", "clear", "load", "write",
  "and", "or", "not", "if", "then", "else", "end", "true", "false", "nil", "local", "function", "return",
];

const NAMED_LIKE_KEYWORDS = KEYWORDS.flatMap((word) => [
  file(`assets/Backdrops/${word}.png`),
  file(`assets/Portraits/${word}.png`),
  file(`assets/Sounds/${word}.wav`, "audio"),
  file(`assets/Music/${word}.mp3`, "audio"),
]);

const NAME_FORMS = ["door-knock", "2door", "caf\u00e9", "\u30c6\u30e9\u30b9", "plaza.v2", "door knock", "with"];

const OFFERED_FORMS: Record<AddMenuKind, string[]> = {
  backdrop: ["caf\u00e9", "door-knock", "plaza.v2", "\u30c6\u30e9\u30b9"],
  portrait: ["caf\u00e9", "door-knock", "plaza.v2", "\u30c6\u30e9\u30b9"],
  sound: ["2door", "caf\u00e9", "door-knock", "\u30c6\u30e9\u30b9"],
  music: ["2door", "caf\u00e9", "door-knock", "\u30c6\u30e9\u30b9"],
};

const FORM_FOLDERS: Record<AddMenuKind, [string, string, string]> = {
  backdrop: ["assets/Backdrops/forms", "png", "image"],
  portrait: ["assets/Portraits/forms", "png", "image"],
  sound: ["assets/Sounds/forms", "wav", "audio"],
  music: ["assets/Music/forms", "mp3", "audio"],
};

const formsFor = (kind: AddMenuKind) => {
  const [folder, ending, type] = FORM_FOLDERS[kind];
  return NAME_FORMS.map((name) => file(`${folder}/${name}.${ending}`, type));
};

const ODD_NAMES = [
  file("assets/Backdrops/With.png"),
  file("assets/Backdrops/AFTER.png"),
  file("assets/Sounds/Show.wav", "audio"),
  file("assets/Sounds/door-knock.wav", "audio"),
  file("assets/Sounds/2door.wav", "audio"),
  file("assets/Backdrops/café.png"),
  file("assets/Backdrops/sea.png"),
  file("assets/Backdrops/sea.jpg"),
  file("assets/Backdrops/Sea.png"),
  file("assets/Sounds/with/clang.wav", "audio"),
  file("assets/Backdrops/show/hall.png"),
  file("assets/Sounds/rain.wav", "audio"),
  file("assets/Backdrops/rain.png"),
  file("assets/Portraits/beach.png"),
];

const summary = (kind: AddMenuKind) =>
  pickerItems(kind, FILES, FOLDERS).map((item) => [item.reference, item.caption, item.src]);

describe("the pickers' cards", () => {
  it("offer each backdrop by its base name, captioned with its subfolder, at any depth and case", () => {
    expect(summary("backdrop")).toEqual([
      ["beach", "", "blob:assets/Backdrops/beach.png"],
      ["plaza", "city", "blob:assets/art/BACKDROPS/city/plaza.jpg"],
      ["plaza.v2", "city", "blob:assets/art/backdrops/city/plaza.v2.jpg"],
    ]);
  });

  it("offer no alternate, no thing without a base picture, and no file whose name a script cannot write", () => {
    const references = ADD_MENU_KINDS.flatMap((kind) => pickerItems(kind, FILES, FOLDERS).map((item) => item.reference));
    expect(references.filter((reference) => /[@~ ]|^(harbor|kai|click\.v2)$/.test(reference))).toEqual([]);
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

  it("offer no name that two pictures or two sounds of the project share, since the game draws only one of them", () => {
    const shared = [
      ...FILES,
      file("assets/Backdrops/sea.png"),
      file("assets/Backdrops/sea.jpg"),
      file("assets/Backdrops/Sea.png"),
      file("assets/Images/plaza.png"),
      file("assets/Portraits/beach.png"),
      file("assets/Backdrops/rain.png"),
      file("assets/Sounds/rain.wav", "audio"),
      file("assets/Music/door.mp3", "audio"),
    ];
    const references = (kind: AddMenuKind) =>
      pickerItems(kind, shared, FOLDERS).map((item) => item.reference);
    expect(references("backdrop")).toEqual(["rain", "Sea", "plaza.v2"]);
    expect(references("portrait")).toEqual(["imani", "mia"]);
    expect(references("sound")).toEqual(["rain", "click"]);
    expect(references("music")).toEqual(["theme"]);
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

const compiled = (text: string, files: readonly { path: string; type: string; src: string }[]) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN_URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...files.filter(({ type }) => type === "image" || type === "audio").map(({ path, type, src }) => ({
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
    const messagesOf = (uri: string) =>
      (program.diagnostics?.[uri] ?? []).map((diagnostic) =>
        typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value,
      );
    return {
      messages: messagesOf(MAIN_URI),
      messagesOf,
      context: (program.context ?? {}) as Record<string, Record<string, { uri?: string }> | undefined>,
    };
  } finally {
    Object.assign(console, { warn, error, log });
  }
};

describe("what the pickers insert", () => {
  it("compiles with no diagnostic on the script or the card's own file, and draws that file, for every card the pickers offer", () => {
    const problems = ADD_MENU_KINDS.flatMap((kind) => {
      const files = [...FILES, ...NAMED_LIKE_KEYWORDS, ...ODD_NAMES, ...formsFor(kind)];
      expect(compiled(SCRIPT, files).messages).toEqual([]);
      return pickerItems(kind, files, FOLDERS).flatMap((item) => {
        const { messages, messagesOf, context } = compiled(inserted(CONSTRUCTS[kind], item.reference), files);
        const drawn = context[ADD_MENU_FILE_TYPES[kind]]?.[item.reference]?.uri;
        return [
          ...messages.map((message) => `${kind} ${item.reference}: ${message}`),
          ...messagesOf(`file:///${item.path}`).map((message) => `${kind} ${item.reference} file: ${message}`),
          ...(drawn === `file:///${item.path}` ? [] : [`${kind} ${item.reference}: draws ${drawn}`]),
        ];
      });
    });
    expect(problems).toEqual([]);
  });

  it("offer every name a script can write in its slot: no space or clause word anywhere, no leading digit for a picture (Invalid syntax in [[show]]), no dot for a sound (it splits the name in (( )))", () => {
    expect(
      ADD_MENU_KINDS.map((kind) => [kind, pickerItems(kind, formsFor(kind), FOLDERS).map((item) => item.reference)]),
    ).toEqual(ADD_MENU_KINDS.map((kind) => [kind, OFFERED_FORMS[kind]]));
  });
});

describe("the files a picker leaves out", () => {
  it.each([
    ["sound", "an empty folder", [], 0],
    ["sound", "only names a script can use", [file("assets/Sounds/door.wav", "audio")], 0],
    [
      "sound",
      "a space, a clause word, a dot and a name another sound shares",
      [
        file("assets/Sounds/door.wav", "audio"),
        file("assets/Sounds/door knock.wav", "audio"),
        file("assets/Sounds/with.wav", "audio"),
        file("assets/Sounds/click.v2.ogg", "audio"),
        file("assets/Sounds/rain.wav", "audio"),
        file("assets/Music/rain.mp3", "audio"),
      ],
      4,
    ],
    [
      "music",
      "a name a sound elsewhere shares counts in each picker that holds it",
      [file("assets/Sounds/rain.wav", "audio"), file("assets/Music/rain.mp3", "audio")],
      1,
    ],
    [
      "backdrop",
      "a leading digit and two pictures named alike, but not an alternate or a picture with no base",
      [
        file("assets/Backdrops/beach.png"),
        file("assets/Backdrops/beach@night.png"),
        file("assets/Backdrops/harbor@storm.png"),
        file("assets/Backdrops/2nd.png"),
        file("assets/Backdrops/sea.png"),
        file("assets/Backdrops/sea.jpg"),
      ],
      3,
    ],
    [
      "portrait",
      "not a layer file, nor a layer with no base",
      [
        file("assets/Portraits/imani.png"),
        file("assets/Portraits/imani~mood.happy.png"),
        file("assets/Portraits/kai~eyes.closed.png"),
      ],
      0,
    ],
  ] as const)("%s picker with %s leaves out %#", (kind, _case, files, count) => {
    expect(pickerLeftOut(kind as AddMenuKind, files, FOLDERS)).toBe(count);
  });

  it("counts only files the picker would otherwise offer, so offered and left out add up to its things", () => {
    const things = ADD_MENU_KINDS.map(
      (kind) => pickerItems(kind, FILES, FOLDERS).length + pickerLeftOut(kind, FILES, FOLDERS),
    );
    expect(things).toEqual([3, 2, 1, 4]);
  });
});

describe("a sound's length", () => {
  it("reads as minutes and two-digit seconds, rounding down", () => {
    expect([0, 2.9, 61, 600.4, -1].map(lengthLabel)).toEqual(["0:00", "0:02", "1:01", "10:00", "0:00"]);
  });
});
