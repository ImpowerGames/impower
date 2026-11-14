import {
  planInsertion,
  type InsertConstruct,
} from "@impower/codemirror-vscode-lsp-client/src/insert";
import { assetNameOf } from "@impower/sparkdown/src/attributes/imageFileName";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { endsDialogueBlock } from "@impower/sparkdown/src/compiler/utils/endsDialogueBlock";
import { resolveImageLayers } from "@impower/sparkdown/src/compiler/utils/resolveImageLayers";
import { describe, expect, it } from "vitest";
import {
  lengthLabel,
  pickerItems,
  pickerLeftOut,
} from "../../src/modules/spark-editor/components/add-panel/pickerItems";
import {
  addMenuFiles,
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
  file("assets/art/backdrops/city/2nd.jpg"),
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

const NAME_CASES = [
  "door", "door-knock", "Door_Knock", "_x", "x9", "caf\u00e9", "\u30c6\u30e9\u30b9",
  "2door", "plaza.v2", "door!", "door-", "a+b", "nonewhere", "none", "door knock",
  "With", "AFTER", "Show", "Loop",
  ...KEYWORDS,
];

const KIND_FILES: Record<AddMenuKind, [string, string, string]> = {
  backdrop: ["assets/Backdrops", "png", "image"],
  portrait: ["assets/Portraits", "png", "image"],
  sound: ["assets/Sounds", "wav", "audio"],
  music: ["assets/Music", "mp3", "audio"],
};

const caseFile = (kind: AddMenuKind, name: string) => {
  const [folder, ending, type] = KIND_FILES[kind];
  return file(`${folder}/${name}.${ending}`, type);
};

const summary = (kind: AddMenuKind) =>
  pickerItems(kind, FILES, FOLDERS).map((item) => [item.reference, item.caption, item.src]);

describe("the pickers' cards", () => {
  it("offer each backdrop picture once per alternate, the plain one first, captioned with its subfolder and alternate, at any depth and case", () => {
    expect(summary("backdrop")).toEqual([
      ["beach", "", "blob:assets/Backdrops/beach.png"],
      ["beach@dusk", "dusk", "blob:assets/Backdrops/beach@dusk.png"],
      ["beach@night", "night", "blob:assets/Backdrops/beach@night.png"],
      ["harbor@storm", "storm", "blob:assets/Backdrops/harbor@storm.png"],
      ["plaza", "city", "blob:assets/art/BACKDROPS/city/plaza.jpg"],
    ]);
    expect(pickerItems("backdrop", FILES, FOLDERS).map((item) => item.name)).toEqual([
      "beach", "beach", "beach", "harbor", "plaza",
    ]);
  });

  it("offer no layer option and no file whose name a script cannot write", () => {
    const references = ADD_MENU_KINDS.flatMap((kind) => pickerItems(kind, FILES, FOLDERS).map((item) => item.reference));
    expect(references.filter((reference) => /[~ .]|^2nd$/.test(reference))).toEqual([]);
  });

  it("offer each portrait once, drawn with its default layers, even when only its layers are files", () => {
    expect(summary("portrait")).toEqual([
      ["imani", "", "blob:assets/Portraits/imani.png"],
      ["kai", "", "blob:assets/Portraits/kai~eyes.closed.png"],
      ["mia", "Side", "blob:assets/Portraits/Side/mia.png"],
    ]);
    expect(pickerItems("portrait", FILES, FOLDERS).map((item) => item.variant)).toEqual([
      { image: "imani", attributes: [] },
      { image: "kai", attributes: [] },
      undefined,
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
      file("assets/Images/harbor@storm.png"),
      file("assets/Images/mia~hat.on.png"),
      file("assets/Backdrops/rain.png"),
      file("assets/Sounds/rain.wav", "audio"),
      file("assets/Music/door.mp3", "audio"),
    ];
    const references = (kind: AddMenuKind) =>
      pickerItems(kind, shared, FOLDERS).map((item) => item.reference);
    expect(references("backdrop")).toEqual(["beach@dusk", "beach@night", "rain", "Sea"]);
    expect(references("portrait")).toEqual(["imani", "kai"]);
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
        name: assetNameOf(path, type),
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
      sceneAssets: program.sceneAssets as Record<string, { image?: string[]; audio?: string[] }> | undefined,
    };
  } finally {
    Object.assign(console, { warn, error, log });
  }
};

const drawnFiles = (context: object, name: string) =>
  resolveImageLayers(context as never, {
    $type: "filtered_image",
    $name: name,
    image: { $name: name },
    attributes: [],
  }).map((layer) => layer.src.replace(/^blob:/, ""));

const outcome = (
  kind: AddMenuKind,
  name: string,
  files: readonly ReturnType<typeof file>[],
  path: string,
  drawn: readonly string[] = [path],
) => {
  const { messages, messagesOf, context, sceneAssets } = compiled(inserted(CONSTRUCTS[kind], name), files);
  const type = ADD_MENU_FILE_TYPES[kind];
  const used = sceneAssets?.["start"]?.[type as "image" | "audio"] ?? [];
  return [
    ...messages,
    ...messagesOf(`file:///${path}`),
    ...(used.length === 1 && used[0] === name ? [] : [`the scene uses ${JSON.stringify(used)}`]),
    ...(type === "image"
      ? JSON.stringify(drawnFiles(context, name)) === JSON.stringify(drawn)
        ? []
        : [`${name} draws ${JSON.stringify(drawnFiles(context, name))}`]
      : context[type]?.[name]?.uri === `file:///${path}`
        ? []
        : [`${name} is ${context[type]?.[name]?.uri}`]),
  ];
};

describe("what the pickers insert", () => {
  it("is, for every name in its own project, offered exactly when inserting it compiles clean and the scene draws that file", () => {
    const wrong = ADD_MENU_KINDS.flatMap((kind) =>
      NAME_CASES.flatMap((name) => {
        const own = caseFile(kind, name);
        const files = [own, caseFile(kind, "other")];
        const offered = pickerItems(kind, files, FOLDERS).some((item) => item.path === own.path && item.reference === name);
        const problems = outcome(kind, name, files, own.path);
        if (offered && problems.length) return [`${kind} ${name} is offered but: ${problems.join("; ")}`];
        if (!offered && !problems.length) return [`${kind} ${name} is left out but inserts cleanly`];
        return [];
      }),
    );
    expect(wrong).toEqual([]);
  });

  it("is, for every card of pictures with alternates and layers, the name the compiler reads as that picture", () => {
    const files = [
      file("assets/Backdrops/beach.png"),
      file("assets/Backdrops/beach@night.png"),
      file("assets/Backdrops/harbor@calm.png"),
      file("assets/Backdrops/harbor@storm.png"),
      file("assets/Backdrops/cottage.png"),
      file("assets/Backdrops/cottage~sheep.png"),
      file("assets/Portraits/imani.png"),
      file("assets/Portraits/imani~face.happy~default.png"),
      file("assets/Portraits/imani~face.sad.png"),
      file("assets/Portraits/kai~eyes.open~default.png"),
      file("assets/Portraits/kai~eyes.closed.png"),
      file("assets/Portraits/zadie@coat.png"),
      file("assets/Portraits/zadie@coat~face.happy~default.png"),
    ];
    const cards = (["backdrop", "portrait"] as const).flatMap((kind) =>
      pickerItems(kind, files, FOLDERS).map((item) => ({ kind, item })),
    );
    expect(cards.map(({ item }) => item.reference)).toEqual([
      "beach", "beach@night", "cottage", "harbor@calm", "harbor@storm", "imani", "kai", "zadie@coat",
    ]);
    const drawn: Record<string, string[]> = {
      beach: ["assets/Backdrops/beach.png"],
      "beach@night": ["assets/Backdrops/beach@night.png"],
      cottage: ["assets/Backdrops/cottage.png", "assets/Backdrops/cottage~sheep.png"],
      "harbor@calm": ["assets/Backdrops/harbor@calm.png"],
      "harbor@storm": ["assets/Backdrops/harbor@storm.png"],
      imani: ["assets/Portraits/imani.png", "assets/Portraits/imani~face.happy~default.png"],
      kai: ["assets/Portraits/kai~eyes.open~default.png"],
      "zadie@coat": ["assets/Portraits/zadie@coat.png", "assets/Portraits/zadie@coat~face.happy~default.png"],
    };
    const wrong = cards.flatMap(({ kind, item }) =>
      outcome(kind, item.reference, files, item.path, drawn[item.reference]).map(
        (problem) => `${item.reference}: ${problem}`,
      ),
    );
    expect(wrong).toEqual([]);
  });

  it("leaves out a name two files share, which the compiler warns about on each file", () => {
    const files = [
      file("assets/Backdrops/sea.png"),
      file("assets/Backdrops/sea.jpg"),
      file("assets/Portraits/beach.png"),
      file("assets/Backdrops/beach.png"),
      file("assets/Sounds/rain.wav", "audio"),
      file("assets/Music/rain.mp3", "audio"),
      file("assets/Backdrops/rain.png"),
    ];
    const { messagesOf } = compiled(SCRIPT, files);
    const warned = files
      .filter((candidate) => messagesOf(`file:///${candidate.path}`).some((message) => message.startsWith("Asset name collision")))
      .map((candidate) => candidate.path);
    const leftOut = ADD_MENU_KINDS.flatMap((kind) => {
      const offered = new Set(pickerItems(kind, files, FOLDERS).map((item) => item.path));
      return files.filter((candidate) => addMenuFiles([candidate], kind, FOLDERS).length && !offered.has(candidate.path)).map((candidate) => candidate.path);
    });
    expect(warned.sort()).toEqual([...leftOut].sort());
    expect(warned).not.toContain("assets/Backdrops/rain.png");
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
      "a leading digit and one picture with two files, but not an alternate or a picture with no plain file",
      [
        file("assets/Backdrops/beach.png"),
        file("assets/Backdrops/beach@night.png"),
        file("assets/Backdrops/harbor@storm.png"),
        file("assets/Backdrops/2nd.png"),
        file("assets/Backdrops/sea.png"),
        file("assets/Backdrops/sea.jpg"),
      ],
      2,
    ],
    [
      "backdrop",
      "two files of a picture and two of its alternate, each picture counted once",
      [
        file("assets/Backdrops/beach.png"),
        file("assets/Backdrops/beach.jpg"),
        file("assets/Backdrops/beach@night.png"),
        file("assets/Backdrops/beach@night.jpg"),
      ],
      2,
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

  it("offers a folder of numbered layer files as one picture named by its folder, drawn with its default layers", () => {
    const layers = ["90_body.png", "30_face.happy.png", "30_face.neutral~default.png", "10_hat.on.png"].map((leaf) =>
      file(`assets/Portraits/mia/${leaf}`),
    );
    const items = pickerItems("portrait", layers, FOLDERS);
    expect(items.map((item) => [item.reference, item.variant])).toEqual([["mia", { image: "mia", attributes: [] }]]);
    expect(pickerLeftOut("portrait", layers, FOLDERS)).toBe(0);
    expect(
      outcome("portrait", "mia", layers, items[0]!.path, [
        "assets/Portraits/mia/90_body.png",
        "assets/Portraits/mia/30_face.neutral~default.png",
      ]),
    ).toEqual([]);
  });

  it("counts only pictures the picker would otherwise offer, so offered and left out add up to its cards", () => {
    const things = ADD_MENU_KINDS.map(
      (kind) => pickerItems(kind, FILES, FOLDERS).length + pickerLeftOut(kind, FILES, FOLDERS),
    );
    expect(things).toEqual([6, 3, 1, 4]);
  });
});

describe("a sound's length", () => {
  it("reads as minutes and two-digit seconds, rounding down", () => {
    expect([0, 2.9, 61, 600.4, -1].map(lengthLabel)).toEqual(["0:00", "0:02", "1:01", "10:00", "0:00"]);
  });
});
