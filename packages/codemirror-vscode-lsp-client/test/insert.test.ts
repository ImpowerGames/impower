import { history, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getDocumentSymbols } from "../../sparkdown-language-server/src/utils/providers/getDocumentSymbols";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LSPClient } from "../src/client";
import {
  INSERT_CONSTRUCTS,
  insertConstruct,
  insertConstructFromServer,
  insertContext,
  planInsertion,
  sceneSpansOf,
  storyBlocksOf,
  TOP_LEVEL_CONSTRUCTS,
  uniqueName,
  type InsertConstruct,
} from "../src/insert";

vi.mock("@codemirror/language", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codemirror/language")>();
  const { SparkdownDocumentRegistry: Registry } =
    await import("@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry");
  return {
    ...actual,
    ensureSyntaxTree: (state: { doc: { toString(): string } }) => {
      const documents = new Registry(["declarations"]);
      const uri = "file:///editor.sd";
      documents.set({
        textDocument: {
          uri,
          text: state.doc.toString(),
          version: 1,
          languageId: "sparkdown",
        },
      });
      return documents.tree(uri);
    },
  };
});

const TOP_LEVEL: readonly InsertConstruct[] = TOP_LEVEL_CONSTRUCTS;

const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);

const lines = (...text: string[]) => text.join(LF);

const caretAt = (source: string, marker: string, shift = 0) => {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`no ${marker} in fixture`);
  return index + shift;
};

const SYMBOLS_URI = "file:///insert.sd";

const parsed = (source: string) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: {
      uri: SYMBOLS_URI,
      text: source,
      version: 1,
      languageId: "sparkdown",
    },
  });
  return documents;
};

const symbolsOf = (source: string) => {
  const documents = parsed(source);
  return getDocumentSymbols(
    documents.get(SYMBOLS_URI)!,
    documents.annotations(SYMBOLS_URI),
    documents.tree(SYMBOLS_URI),
  );
};

const treeOf = (source: string) => parsed(source).tree(SYMBOLS_URI)!;

const scenesOf = (source: string) => sceneSpansOf(symbolsOf(source));

const structureOf = (source: string) => ({
  scenes: scenesOf(source),
  blocks: storyBlocksOf(treeOf(source), source),
});

const contextAt = (source: string, offset: number) =>
  insertContext(source, offset, scenesOf(source));

const apply = (source: string, caret: number, construct: InsertConstruct) => {
  const plan = planInsertion(source, caret, construct, structureOf(source));
  if (!plan) return null;
  const text = source.slice(0, plan.from) + plan.insert + source.slice(plan.to);
  return {
    text,
    selected: text.slice(plan.anchor, plan.head),
  };
};

const MAIN = "file://proj/main.sd";

const diagnosticsOf = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    const { program } = compiler.compile({ textDocument: { uri: MAIN } });
    return (program.diagnostics?.[MAIN] ?? []).map((d) =>
      typeof d.message === "string" ? d.message : d.message.value,
    );
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const SCENE_END = lines("  The door opens.", "", "end");
const sceneEnd = (source: string) =>
  caretAt(source.split(CRLF).join(LF), SCENE_END) + SCENE_END.length - 3;

const SCRIPT = lines(
  "---",
  "title: Test",
  "---",
  "",
  "define IMANI as character with",
  '  name = "Imani"',
  "end",
  "",
  "scene start",
  "  The room is quiet.",
  "  IMANI:",
  "    A line with words.",
  "    Another line.",
  "  The door opens.",
  "",
  "end",
  "",
  "scene later",
  "  Later.",
  "end",
  "",
);

describe("unique names", () => {
  it("uses the bare name first and appends the next free number", () => {
    expect(uniqueName("scene start", "new_scene")).toBe("new_scene");
    expect(uniqueName("scene new_scene", "new_scene")).toBe("new_scene_2");
    expect(
      uniqueName(lines("scene new_scene", "scene new_scene_2"), "new_scene"),
    ).toBe("new_scene_3");
    expect(uniqueName("scene new_scenery", "new_scene")).toBe("new_scene");
  });
});

describe("insertion context", () => {
  it("is in a scene from its header through its end line, and outside it elsewhere", () => {
    expect(contextAt(SCRIPT, caretAt(SCRIPT, "The room")).inScene).toBe(true);
    expect(contextAt(SCRIPT, caretAt(SCRIPT, "scene start")).inScene).toBe(
      true,
    );
    expect(contextAt(SCRIPT, sceneEnd(SCRIPT)).inScene).toBe(true);
    expect(contextAt(SCRIPT, caretAt(SCRIPT, "define")).inScene).toBe(false);
    expect(contextAt(SCRIPT, caretAt(SCRIPT, "title")).inScene).toBe(false);
    expect(contextAt(SCRIPT, caretAt(SCRIPT, "scene later") - 1).inScene).toBe(
      false,
    );
  });

  it("refuses story blocks outside a scene and keeps Scene and Character", () => {
    const outside = caretAt(SCRIPT, "title");
    for (const construct of INSERT_CONSTRUCTS) {
      const plan = planInsertion(
        SCRIPT,
        outside,
        construct,
        structureOf(SCRIPT),
      );
      if (construct === "scene" || construct === "character") {
        expect(plan, construct).not.toBeNull();
      } else {
        expect(plan, construct).toBeNull();
      }
    }
  });
});

describe("Scene", () => {
  it("goes after the current scene, selecting its name", () => {
    const result = apply(SCRIPT, caretAt(SCRIPT, "The room"), "scene")!;
    expect(result.text).toBe(
      SCRIPT.replace(
        lines("end", "", "scene later"),
        lines("end", "", "scene new_scene", "  ", "end", "", "scene later"),
      ),
    );
    expect(result.selected).toBe("new_scene");
  });

  it("goes at the end outside any scene", () => {
    const result = apply(SCRIPT, caretAt(SCRIPT, "title"), "scene")!;
    expect(result.text).toBe(
      SCRIPT + lines("", "scene new_scene", "  ", "end", ""),
    );
    expect(result.selected).toBe("new_scene");
  });

  it("adds no diagnostic an empty script did not already have", () => {
    const result = apply("", 0, "scene")!;
    expect(diagnosticsOf(result.text)).toEqual(diagnosticsOf(""));
  });

  it("starts an empty script", () => {
    const result = apply("", 0, "scene")!;
    expect(result.text).toBe(lines("scene new_scene", "  ", "end", ""));
    expect(result.selected).toBe("new_scene");
  });
});

describe("Character", () => {
  it("goes at the top level before the first scene, after the setup, selecting its id", () => {
    const result = apply(SCRIPT, caretAt(SCRIPT, "Later."), "character")!;
    expect(result.text).toBe(
      SCRIPT.replace(
        lines("end", "", "scene start"),
        lines(
          "end",
          "",
          "define new_character as character with",
          '  name = "New character"',
          "end",
          "",
          "scene start",
        ),
      ),
    );
    expect(result.selected).toBe("new_character");
    const second = apply(result.text, 0, "character")!;
    expect(second.selected).toBe("new_character_2");
  });
});

describe("Branch, Choice Menu and Dialogue", () => {
  it("replace a blank line inside a scene", () => {
    const source = lines("scene start", "  Hello.", "", "end", "");
    const caret = caretAt(source, "Hello.") + "Hello.".length + 1;
    const result = apply(source, caret, "branch")!;
    expect(result.text).toBe(
      lines(
        "scene start",
        "  Hello.",
        "  branch new_branch",
        "    ",
        "  end",
        "end",
        "",
      ),
    );
    expect(result.selected).toBe("new_branch");
  });

  it("go after the caret line's content at its indent", () => {
    const result = apply(SCRIPT, caretAt(SCRIPT, "quiet"), "choose")!;
    expect(result.text).toBe(
      SCRIPT.replace(
        "  The room is quiet." + LF,
        lines(
          "  The room is quiet.",
          "  choose",
          "    What happens next?",
          "    + [First option]",
          "      The first path begins here.",
          "    + [Second option]",
          "      The second path begins here.",
          "  end",
          "",
        ),
      ),
    );
    expect(result.selected).toBe("What happens next?");
  });

  it("go one level deeper after a scene, branch or choose header", () => {
    const source = lines(
      "scene start",
      "  branch hall",
      "    Dark.",
      "  end",
      "end",
      "",
    );
    const result = apply(source, caretAt(source, "hall"), "dialogue")!;
    expect(result.text).toBe(
      lines(
        "scene start",
        "  branch hall",
        "    CHARACTER:",
        "      What do they say?",
        "    Dark.",
        "  end",
        "end",
        "",
      ),
    );
    expect(result.selected).toBe("CHARACTER");
  });

  it("treat a blank line inside a cue's dialogue as inside it, and one after it as outside", () => {
    const source = lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  IMANI:",
      "    First.",
      "",
      "    Second.",
      "",
      "  The door opens.",
      "end",
      "",
    );
    const inside = caretAt(source, "First.") + "First.".length + 1;
    const dialogue = apply(source, inside, "dialogue")!;
    expect(dialogue.text).toBe(
      source.replace(
        "    Second." + LF,
        lines("    Second.", "  IMANI:", "    What do they say?", ""),
      ),
    );
    expect(dialogue.selected).toBe("What do they say?");
    const branch = apply(source, inside, "branch")!;
    expect(branch.text).toBe(
      source.replace(
        "    Second." + LF,
        lines("    Second.", "  branch new_branch", "    ", "  end", ""),
      ),
    );
    expect(diagnosticsOf(dialogue.text)).toEqual([]);
    expect(diagnosticsOf(branch.text)).toEqual([]);
    const after = caretAt(source, "Second.") + "Second.".length + 1;
    const outside = apply(source, after, "choose")!;
    expect(outside.text).toBe(
      source.replace(
        lines("    Second.", "", "  The door"),
        lines(
          "    Second.",
          "  choose",
          "    What happens next?",
          "    + [First option]",
          "      The first path begins here.",
          "    + [Second option]",
          "      The second path begins here.",
          "  end",
          "  The door",
        ),
      ),
    );
  });

  it("keep a cue's dialogue with its cue and take the nearest speaker inside it", () => {
    const dialogue = apply(SCRIPT, caretAt(SCRIPT, "A line"), "dialogue")!;
    expect(dialogue.text).toBe(
      SCRIPT.replace(
        "    Another line." + LF,
        lines("    Another line.", "  IMANI:", "    What do they say?", ""),
      ),
    );
    expect(dialogue.selected).toBe("What do they say?");
    const branch = apply(SCRIPT, caretAt(SCRIPT, "IMANI:"), "branch")!;
    expect(branch.text).toBe(
      SCRIPT.replace(
        "    Another line." + LF,
        lines("    Another line.", "  branch new_branch", "    ", "  end", ""),
      ),
    );
  });

  it("go inside the scene when the caret is on its closing line", () => {
    const source = lines("scene start", "  Hello.", "end", "");
    const result = apply(source, caretAt(source, "end"), "branch")!;
    expect(result.text).toBe(
      lines(
        "scene start",
        "  Hello.",
        "  branch new_branch",
        "    ",
        "  end",
        "end",
        "",
      ),
    );
    expect(result.selected).toBe("new_branch");
  });

  it("keep a CRLF document's line endings", () => {
    const source = SCRIPT.split(LF).join(CRLF);
    for (const construct of INSERT_CONSTRUCTS) {
      const result = apply(source, caretAt(source, "quiet"), construct)!;
      expect(result.text.replace(/\r\n/g, ""), construct).not.toContain(LF);
      expect(result.selected.length, construct).toBeGreaterThan(0);
      expect(result.text.split(CRLF).join(LF), construct).toBe(
        apply(SCRIPT, caretAt(SCRIPT, "quiet"), construct)!.text,
      );
    }
  });
});

describe("structure read from the language server", () => {
  const STRING_SCENE = lines(
    "store example = [[",
    "scene example",
    "  Example.",
    "end",
    "]]",
    "",
    "scene start",
    "  Hello.",
    "end",
    "",
  );

  it("does not take scene text inside a string for a scene", () => {
    expect(diagnosticsOf(STRING_SCENE)).toEqual([]);
    expect(
      contextAt(STRING_SCENE, caretAt(STRING_SCENE, "Example.")).inScene,
    ).toBe(false);
    const character = apply(
      STRING_SCENE,
      caretAt(STRING_SCENE, "Hello."),
      "character",
    )!;
    expect(character.text).toBe(
      STRING_SCENE.replace(
        lines("]]", "", "scene start"),
        lines(
          "]]",
          "",
          "define new_character as character with",
          '  name = "New character"',
          "end",
          "",
          "scene start",
        ),
      ),
    );
    expect(character.selected).toBe("new_character");
  });

  it("keeps a nested end at the scene's indent inside the scene", () => {
    const source = lines(
      "scene start",
      "branch hall",
      "  Dark.",
      "end",
      "  After.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    expect(contextAt(source, caretAt(source, "After.")).inScene).toBe(true);
    const scene = apply(source, caretAt(source, "Dark."), "scene")!;
    expect(scene.text).toBe(
      lines(
        "scene start",
        "branch hall",
        "  Dark.",
        "end",
        "  After.",
        "end",
        "",
        "scene new_scene",
        "  ",
        "end",
        "",
      ),
    );
    expect(diagnosticsOf(scene.text)).toEqual([]);
  });

  it("recognizes a cue with a trailing comment as the speaker", () => {
    const source = lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  IMANI: // speaker note",
      "    First.",
      "    Second.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const dialogue = apply(source, caretAt(source, "IMANI: //"), "dialogue")!;
    expect(dialogue.text).toBe(
      source.replace(
        "    Second." + LF,
        lines("    Second.", "  IMANI:", "    What do they say?", ""),
      ),
    );
    expect(dialogue.selected).toBe("What do they say?");
    expect(diagnosticsOf(dialogue.text)).toEqual([]);
  });

  it("inserts nothing when the editor has no language server to ask", async () => {
    const view = new EditorView({
      state: EditorState.create({ doc: SCRIPT }),
      parent: document.body,
    });
    try {
      expect(await insertConstructFromServer(view, "scene")).toBe(false);
      expect(view.state.doc.toString()).toBe(SCRIPT);
    } finally {
      view.destroy();
    }
  });
});

describe("insertConstructFromServer", () => {
  const SOURCE = lines("scene start", "  Hello.", "end");
  const views: EditorView[] = [];

  afterEach(() => {
    views.splice(0).forEach((view) => view.destroy());
    vi.restoreAllMocks();
  });

  const pending = () => {
    const client = new LSPClient();
    let resolve!: (value: unknown) => void;
    const response = new Promise((done) => {
      resolve = done;
    });
    vi.spyOn(client, "request").mockReturnValue(response as never);
    const view = new EditorView({
      state: EditorState.create({
        doc: SOURCE,
        selection: { anchor: SOURCE.indexOf("Hello.") },
        extensions: [
          client.plugin({ uri: SYMBOLS_URI, version: 1 }, "sparkdown"),
        ],
      }),
      parent: document.body,
    });
    views.push(view);
    return { view, resolve: () => resolve(symbolsOf(SOURCE)) };
  };

  it("inserts with the server's scenes once they arrive", async () => {
    const { view, resolve } = pending();
    const result = insertConstructFromServer(view, "branch");
    resolve();
    expect(await result).toBe(true);
    expect(view.state.doc.toString()).toContain(
      lines("  Hello.", "  branch new_branch", "    ", "  end", "end"),
    );
  });

  it("inserts nothing when the script changed while the server answered", async () => {
    const { view, resolve } = pending();
    const result = insertConstructFromServer(view, "branch");
    view.dispatch({ changes: { from: 0, insert: LF } });
    resolve();
    expect(await result).toBe(false);
    expect(view.state.doc.toString()).toBe(LF + SOURCE);
  });

  it("never applies an answer to a script edited after it arrived", async () => {
    const { view, resolve } = pending();
    const outside = "store gold = 1";
    const result = insertConstructFromServer(view, "branch");
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: outside },
      selection: { anchor: 0 },
    });
    await result;
    expect(view.state.doc.toString()).toBe(outside);
  });

  it("inserts nothing into an editor destroyed while the server answered", async () => {
    const { view, resolve } = pending();
    const result = insertConstructFromServer(view, "branch");
    view.destroy();
    resolve();
    expect(await result).toBe(false);
    expect(view.state.doc.toString()).toBe(SOURCE);
  });
});

describe("statement boundaries read from the syntax tree", () => {
  it("adds after a whole choice menu when the caret is on one of its options", () => {
    const source = lines(
      "scene start",
      "  choose",
      "    Prompt?",
      "    + [First]",
      "      First path.",
      "    + [Second]",
      "      Second path.",
      "  end",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const branch = apply(source, caretAt(source, "+ [First]"), "branch")!;
    expect(branch.text).toBe(
      source.replace(
        lines("  end", "end"),
        lines("  end", "  branch new_branch", "    ", "  end", "end"),
      ),
    );
    expect(branch.selected).toBe("new_branch");
    expect(diagnosticsOf(branch.text)).toEqual([]);
  });

  it("keeps a dialogue whole across a standalone comment line", () => {
    const source = lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  IMANI:",
      "    First.",
      "// note",
      "    Second.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const expected = source.replace(
      "    Second." + LF,
      lines("    Second.", "  IMANI:", "    What do they say?", ""),
    );
    for (const marker of ["First.", "Second."]) {
      const dialogue = apply(source, caretAt(source, marker), "dialogue")!;
      expect(dialogue.text, marker).toBe(expected);
      expect(dialogue.selected, marker).toBe("What do they say?");
    }
    expect(diagnosticsOf(expected)).toEqual([]);
  });

  it("adds after a statement holding a multiline string, not inside the string", () => {
    const source = lines(
      'store example = ""',
      "",
      "scene start",
      "  & example = [[",
      "    Example.",
      "  ]]",
      "  After.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const branch = apply(source, caretAt(source, "Example."), "branch")!;
    expect(branch.text).toBe(
      source.replace(
        lines("  ]]", "  After."),
        lines("  ]]", "  branch new_branch", "    ", "  end", "  After."),
      ),
    );
    expect(diagnosticsOf(branch.text)).toEqual([]);
    const names: string[] = [];
    const walk = (symbols: { name: string; children?: unknown[] }[]) => {
      for (const symbol of symbols) {
        names.push(symbol.name);
        walk((symbol.children ?? []) as never);
      }
    };
    walk(symbolsOf(branch.text));
    expect(names).toContain("new_branch");
  });
});

describe("inserted syntax", () => {
  it("compiles without diagnostics for each text construct", () => {
    expect(diagnosticsOf(SCRIPT)).toEqual([]);
    for (const construct of [
      "scene",
      "character",
      "branch",
      "choose",
      "dialogue",
    ] as const) {
      for (const [marker, caret] of [
        ["after content", caretAt(SCRIPT, "quiet")],
        ["inside a cue", caretAt(SCRIPT, "A line")],
        ["on a cue", caretAt(SCRIPT, "IMANI:")],
        ["blank line", sceneEnd(SCRIPT) - 1],
        ["scene end", sceneEnd(SCRIPT)],
        ["outside", caretAt(SCRIPT, "title")],
      ] as const) {
        const result = apply(SCRIPT, caret, construct);
        if (marker === "outside" && !TOP_LEVEL.includes(construct)) {
          expect(result, `${construct} at ${marker}`).toBeNull();
          continue;
        }
        expect(result, `${construct} at ${marker}`).not.toBeNull();
        if (!result) continue;
        const expected =
          result.selected === "CHARACTER"
            ? ["Cannot find character named `CHARACTER`"]
            : [];
        expect(diagnosticsOf(result.text), `${construct} at ${marker}`).toEqual(
          expected,
        );
      }
    }
  });
});

describe("insertConstruct command", () => {
  let view: EditorView | undefined;
  afterEach(() => {
    view?.destroy();
    view = undefined;
  });

  const mount = (doc: string, caret: number, readOnly = false) => {
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: caret },
        extensions: [history(), EditorState.readOnly.of(readOnly)],
      }),
      parent: document.body,
    });
    return view;
  };

  it("inserts in one undo step and selects the placeholder", () => {
    const editor = mount(SCRIPT, caretAt(SCRIPT, "quiet"));
    editor.dispatch({
      changes: { from: 0, insert: "x" },
      userEvent: "input.type",
    });
    const typed = editor.state.doc.toString();
    expect(insertConstruct("choose", structureOf(SCRIPT))(editor)).toBe(true);
    const { from, to } = editor.state.selection.main;
    expect(editor.state.sliceDoc(from, to)).toBe("What happens next?");
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe(typed);
  });

  it("does nothing outside a scene or in a read-only script", () => {
    expect(
      insertConstruct("branch", structureOf(SCRIPT))(mount(SCRIPT, 0)),
    ).toBe(false);
    view!.destroy();
    const locked = mount(SCRIPT, caretAt(SCRIPT, "quiet"), true);
    expect(insertConstruct("branch", structureOf(SCRIPT))(locked)).toBe(false);
    expect(locked.state.doc.toString()).toBe(SCRIPT);
  });
});
