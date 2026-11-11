import { autoClosingPairFor } from "../../packages/codemirror-vscode-language/src/utils/autoClosingPairFor";
import { SPARKDOWN_LANGUAGE_CONFIGS } from "@impower/sparkdown/src/compiler/utils/sparkdownLanguageFor";
import { TextDocument } from "vscode-languageserver-textdocument";
import { beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  commands: new Map<string, (...args: any[]) => unknown>(),
  nativeTypes: 0,
  settings: {
    autoClosingBrackets: "languageDefined",
    autoClosingComments: "languageDefined",
  },
  editor: null as any,
}));

vi.mock("vscode", async () => {
  const { Position, Range, Selection, SnippetString } =
    await import("./fakeVscode");
  return {
    Position,
    Range,
    Selection,
    SnippetString,
    WorkspaceEdit: class {},
    commands: {
      registerCommand: (id: string, fn: (...args: any[]) => unknown) => {
        state.commands.set(id, fn);
        return { dispose: () => state.commands.delete(id) };
      },
      executeCommand: async (id: string, ...args: any[]) => {
        if (id === "default:type") {
          state.nativeTypes++;
          return state.editor?.nativeType(args[0].text);
        }
        return state.commands.get(id)?.(...args);
      },
    },
    window: {
      get activeTextEditor() {
        return state.editor;
      },
    },
    workspace: {
      getConfiguration: (section?: string) =>
        section === "sparkdown"
          ? { editor: { autoCloseAngleBrackets: true } }
          : {
              get: (key: string, fallback: unknown) =>
                section === "editor" && key in state.settings
                  ? state.settings[key as keyof typeof state.settings]
                  : fallback,
            },
    },
  };
});

const vscode = await import("vscode");
const { activateAutoFormatting } = await import(
  "../src/utils/activateAutoFormatting"
);
const { SparkdownDocumentManager } = await import(
  "../src/managers/SparkdownDocumentManager"
);

let uriCount = 0;

class FakeDocument {
  text: TextDocument;
  uri: { toString: () => string };
  constructor(
    readonly languageId: string,
    content: string,
    extension = languageId === "sparkdown" ? "sd" : "luau",
  ) {
    const uri = `file:///pairs-${uriCount++}.${extension}`;
    this.uri = { toString: () => uri };
    this.text = TextDocument.create(uri, languageId, 1, content);
  }
  get version() {
    return this.text.version;
  }
  get lineCount() {
    return this.text.lineCount;
  }
  getText() {
    return this.text.getText();
  }
  offsetAt(position: { line: number; character: number }) {
    return this.text.offsetAt(position);
  }
  positionAt(offset: number) {
    const { line, character } = this.text.positionAt(offset);
    return new vscode.Position(line, character);
  }
  lineAt(line: number) {
    return { text: this.text.getText().split("\n")[line] ?? "" };
  }
  insert(inserts: { offset: number; text: string }[]) {
    this.text = TextDocument.update(
      this.text,
      [...inserts]
        .sort((a, b) => b.offset - a.offset)
        .map(({ offset, text }) => ({
          range: {
            start: this.text.positionAt(offset),
            end: this.text.positionAt(offset),
          },
          text,
        })),
      this.text.version + 1,
    );
  }
}

class FakeEditor {
  edits: string[][] = [];
  selections: InstanceType<typeof vscode.Selection>[];
  constructor(
    readonly document: FakeDocument,
    offsets: number[],
  ) {
    this.selections = offsets.map((offset) => {
      const position = document.positionAt(offset);
      return new vscode.Selection(position, position);
    });
  }
  get selection() {
    return this.selections[0]!;
  }
  async edit(
    build: (editBuilder: {
      insert: (position: any, text: string) => void;
    }) => void,
  ) {
    const inserts: { offset: number; text: string }[] = [];
    build({
      insert: (position, text) =>
        inserts.push({ offset: this.document.offsetAt(position), text }),
    });
    this.edits.push(inserts.map(({ text }) => text));
    this.document.insert(inserts);
    return true;
  }
  nativeType(text: string) {
    const config =
      SPARKDOWN_LANGUAGE_CONFIGS[
        this.document.languageId as keyof typeof SPARKDOWN_LANGUAGE_CONFIGS
      ];
    const offsets = this.selections.map(({ active }) =>
      this.document.offsetAt(active),
    );
    const inserts = offsets.map((offset) => {
      const before = this.document.getText().slice(0, offset);
      const after = this.document.getText().slice(offset);
      const lineBefore = before.slice(before.lastIndexOf("\n") + 1);
      const lineAfter = after.split("\n")[0]!;
      const next = lineAfter.charAt(0);
      const match = autoClosingPairFor(
        config.autoClosingPairs,
        text,
        lineBefore,
        lineAfter,
      );
      const mode = match?.pair.open.includes(config.comments.blockComment[0]!)
        ? state.settings.autoClosingComments
        : state.settings.autoClosingBrackets;
      const canClose =
        mode !== "never" && (!next || config.autoCloseBefore.includes(next));
      return { offset, text: text + (canClose ? (match?.close ?? "") : "") };
    });
    this.document.insert(inserts);
    this.selections = offsets.map((offset) => {
      const shift = inserts.reduce(
        (sum, other) => (other.offset < offset ? sum + other.text.length : sum),
        0,
      );
      const position = this.document.positionAt(offset + shift + text.length);
      return new vscode.Selection(position, position);
    });
  }
  withCursors() {
    const text = this.document.getText();
    const offsets = this.selections
      .map(({ active }) => this.document.offsetAt(active))
      .sort((a, b) => b - a);
    return offsets.reduce(
      (result, offset) => result.slice(0, offset) + "|" + result.slice(offset),
      text,
    );
  }
}

const SCENE = (line: string) => `scene start()\n  ${line}\nend\n`;
const FUNCTION = (line: string) => `function f()\n  ${line}\nend\n`;

const open = (source: string, languageId = "sparkdown") => {
  const offsets: number[] = [];
  let text = "";
  for (const part of source.split("|")) {
    offsets.push(text.length + part.length);
    text += part;
  }
  offsets.pop();
  const document = new FakeDocument(languageId, text);
  SparkdownDocumentManager.instance.add(document as never);
  state.editor = new FakeEditor(document, offsets);
  state.nativeTypes = 0;
  return state.editor as FakeEditor;
};

const type = async (editor: FakeEditor, text: string) => {
  for (const ch of text) {
    await state.commands.get("type")!({ source: "keyboard", text: ch });
  }
  return editor.withCursors();
};

beforeAll(() => {
  activateAutoFormatting({ subscriptions: [] } as never);
});

describe("auto-closing pairs in a .sd document follow the language at the cursor", () => {
  it("inserts `::` alone inside a Luau expression", async () => {
    const editor = open(FUNCTION("local y = x :|"));
    expect(await type(editor, ":")).toBe(FUNCTION("local y = x ::|"));
  });

  it("closes `::` in story text", async () => {
    const editor = open(SCENE("Hello :|"));
    expect(await type(editor, ":")).toBe(SCENE("Hello ::|::"));
  });

  it("closes a typed `--[=[` with `]=]` inside a function body", async () => {
    const editor = open(FUNCTION("|"));
    expect(await type(editor, "--[=[")).toBe(FUNCTION("--[=[|]=]"));
  });

  it("closes a typed `--[==[` with `]==]` inside a function body", async () => {
    const editor = open(FUNCTION("|"));
    expect(await type(editor, "--[==[")).toBe(FUNCTION("--[==[|]==]"));
  });

  it("closes a typed `--[[` with `]]` inside a function body", async () => {
    const editor = open(FUNCTION("|"));
    expect(await type(editor, "--[[")).toBe(FUNCTION("--[[|]]"));
  });

  it("closes a typed `--[=[` as brackets only in story text", async () => {
    const editor = open(SCENE("|"));
    expect(await type(editor, "--[=[")).toBe(SCENE("--[=[|]]"));
  });

  it("leaves every keystroke to VS Code where both languages agree", async () => {
    const editor = open(SCENE("Hello :|"));
    await type(editor, ":(");
    expect(state.nativeTypes).toBe(2);
    expect(editor.edits).toEqual([]);
  });

  it("inserts the typed character and its closer as one edit, so one undo removes both", async () => {
    const editor = open(FUNCTION("--[=|]"));
    expect(await type(editor, "[")).toBe(FUNCTION("--[=[|]=]"));
    expect(editor.edits).toEqual([["[]="]]);
  });

  it("decides each cursor by its own language", async () => {
    const doc = `${SCENE("Hello :|")}\n${FUNCTION("local y = x :|")}`;
    const editor = open(doc);
    expect(await type(editor, ":")).toBe(
      `${SCENE("Hello ::|::")}\n${FUNCTION("local y = x ::|")}`,
    );
  });

  it("reads the language of a line the parse has not seen yet", async () => {
    const editor = open(SCENE("|"));
    editor.document.insert([
      { offset: 0, text: FUNCTION("local y = x :") + "\n" },
    ]);
    const end = FUNCTION("local y = x :").indexOf(":") + 1;
    editor.selections = [
      new vscode.Selection(
        editor.document.positionAt(end),
        editor.document.positionAt(end),
      ),
    ];
    expect(await type(editor, ":")).toBe(
      `${FUNCTION("local y = x ::|")}\n${SCENE("")}`,
    );
  });

  it("closes nothing the editor setting turns off", async () => {
    state.settings.autoClosingBrackets = "never";
    try {
      const editor = open(FUNCTION("local y = x :|"));
      expect(await type(editor, ":")).toBe(FUNCTION("local y = x ::|"));
      expect(editor.edits).toEqual([]);
    } finally {
      state.settings.autoClosingBrackets = "languageDefined";
    }
  });

  it("leaves a Luau block comment open when comment closing is off", async () => {
    state.settings.autoClosingComments = "never";
    try {
      const editor = open(FUNCTION("--[|"));
      expect(await type(editor, "[")).toBe(FUNCTION("--[[|"));
    } finally {
      state.settings.autoClosingComments = "languageDefined";
    }
  });

  it("closes a Luau block comment when only bracket closing is off", async () => {
    state.settings.autoClosingBrackets = "never";
    try {
      const editor = open(FUNCTION("--[|"));
      expect(await type(editor, "[")).toBe(FUNCTION("--[[|]]"));
    } finally {
      state.settings.autoClosingBrackets = "languageDefined";
    }
  });

  it("types natively when no text editor is active", async () => {
    open(FUNCTION("local y = x :|"));
    const editor = state.editor;
    state.editor = undefined;
    try {
      await state.commands.get("type")!({ source: "keyboard", text: "a" });
    } catch (error) {
      expect.unreachable(String(error));
    } finally {
      state.editor = editor;
    }
    expect(state.nativeTypes).toBe(1);
  });
});

describe("a .luau document with comment closing off", () => {
  it("leaves `--[[` open", async () => {
    state.settings.autoClosingComments = "never";
    try {
      const editor = open("--[|\n", "sparkdown-luau");
      expect(await type(editor, "[")).toBe("--[[|\n");
    } finally {
      state.settings.autoClosingComments = "languageDefined";
    }
  });
});

describe("a .luau document", () => {
  it("inserts `::` alone", async () => {
    const editor = open("local y = x :|\n", "sparkdown-luau");
    expect(await type(editor, ":")).toBe("local y = x ::|\n");
    expect(editor.edits).toEqual([]);
  });

  it("closes `--[=[` with `]=]`", async () => {
    const editor = open("|\n", "sparkdown-luau");
    expect(await type(editor, "--[=[")).toBe("--[=[|]=]\n");
    expect(editor.edits).toEqual([]);
  });
});
