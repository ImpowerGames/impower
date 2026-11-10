import { history, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { endsDialogueBlock } from "@impower/sparkdown/src/compiler/utils/endsDialogueBlock";
import { getDocumentSymbols } from "../../sparkdown-language-server/src/utils/providers/getDocumentSymbols";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LSPClient } from "../src/client";
import {
  branchSpansOf,
  INSERT_CONSTRUCTS,
  insertConstruct,
  insertConstructFromServer,
  insertContext,
  planInsertion,
  sceneSpansOf,
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

const structureOf = (source: string) => {
  const lf = source.split(CRLF).join(LF);
  return {
    scenes: scenesOf(lf),
    branches: branchSpansOf(symbolsOf(lf)),
    tree: treeOf(lf),
    endsDialogue: endsDialogueBlock,
  };
};

const ERROR_NODE = /Unknown|Invalid|Illegal/;
const SPACING = ["Newline", "Whitespace"];

interface FlatNode {
  name: string;
  from: number;
  to: number;
}

const flatten = (source: string): FlatNode[] => {
  const nodes: FlatNode[] = [];
  treeOf(source).iterate({
    enter: (node) => {
      if (node.type.isTop || SPACING.includes(node.name)) return;
      const raw = source.slice(node.from, node.to);
      const text = raw.trim();
      if (!text) return;
      const from = node.from + (raw.length - raw.trimStart().length);
      nodes.push({ name: node.name, from, to: from + text.length });
    },
  });
  return nodes;
};

const CR = String.fromCharCode(13);

const toLf = (text: string, offset: number) =>
  offset - text.slice(0, offset).split(CR).length + 1;

interface Change {
  from: number;
  to: number;
  insert: string;
}

const EXPECTED_NODE: Partial<Record<InsertConstruct, string>> = {
  branch: "Branch",
  choose: "LuauSparkdownChooseBlock",
  dialogue: "BlockDialogue",
};

const expectKeepsMeaning = (
  beforeText: string,
  afterText: string,
  construct: InsertConstruct,
  change: Change,
) => {
  const before = beforeText.split(CRLF).join(LF);
  const after = afterText.split(CRLF).join(LF);
  const r0 = toLf(beforeText, change.from);
  const r1 = toLf(beforeText, change.to);
  const a0 = toLf(afterText, change.from);
  const a1 = toLf(afterText, change.from + change.insert.length);
  const delta = a1 - a0 - (r1 - r0);
  const beforeNodes = flatten(before);
  const afterNodes = flatten(after);
  const errors = (nodes: FlatNode[]) =>
    nodes.filter((node) => ERROR_NODE.test(node.name)).length;
  expect(errors(afterNodes), "no new error node").toBeLessThanOrEqual(
    errors(beforeNodes),
  );
  const kept: string[] = [];
  const inside: FlatNode[] = [];
  for (const node of afterNodes) {
    if (node.from >= a0 && node.to <= a1) {
      inside.push(node);
    } else if (node.to <= a0) {
      kept.push(`${node.name}@${node.from}-${node.to}`);
    } else if (node.from >= a1) {
      kept.push(`${node.name}@${node.from - delta}-${node.to - delta}`);
    } else if (node.from < a0 && node.to >= a1) {
      kept.push(`${node.name}@${node.from}-${node.to - delta}`);
    } else {
      kept.push(`STRADDLES ${node.name}@${node.from}-${node.to}`);
    }
  }
  const original = beforeNodes
    .filter((node) => !(node.from >= r0 && node.to <= r1))
    .map((node) => `${node.name}@${node.from}-${node.to}`);
  expect(
    kept,
    "every construct outside the insertion keeps its type and text",
  ).toEqual(original);
  const expected = EXPECTED_NODE[construct];
  if (expected) {
    expect(inside.map((node) => node.name)).toContain(expected);
  }
};

const enclosingKindAt = (source: string, offset: number) => {
  const lf = source.split(CRLF).join(LF);
  const tree = treeOf(lf);
  for (
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
      offset,
      1,
    );
    node;
    node = node.parent
  ) {
    if (node.name === "LuauSparkdownChooseThenClause") return "then";
    if (node.name === "LuauSparkdownChooseBlock_content") {
      let choice = false;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.from > offset) break;
        if (child.name === "Choice") choice = true;
        if (child.name === "LuauSparkdownChooseThenClause") choice = false;
      }
      if (choice) return "option";
    }
  }
  const line = lf.slice(0, offset).split(LF).length - 1;
  const branches = branchSpansOf(symbolsOf(lf));
  if (branches.some((span) => line > span.startLine && line < span.endLine)) {
    return "branch";
  }
  return "scene";
};

const nodeNamesOf = (source: string) => {
  const names: string[] = [];
  for (
    let node = treeOf(source).topNode.firstChild;
    node;
    node = node.nextSibling
  ) {
    names.push(node.name);
  }
  return names;
};

const contextAt = (source: string, offset: number) =>
  insertContext(source, offset, scenesOf(source));

const apply = (source: string, caret: number, construct: InsertConstruct) => {
  const plan = planInsertion(source, caret, construct, structureOf(source));
  if (!plan) return null;
  const text = source.slice(0, plan.from) + plan.insert + source.slice(plan.to);
  expectKeepsMeaning(source, text, construct, plan);
  const inserted = text.split(CRLF).join(LF);
  const blockStart = toLf(text, plan.from);
  const firstContent = inserted.slice(blockStart).search(/\S/) + blockStart;
  return {
    text,
    selected: text.slice(plan.anchor, plan.head),
    inside: TOP_LEVEL.includes(construct)
      ? null
      : enclosingKindAt(inserted, firstContent),
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
        "  IMANI: // speaker note" + LF,
        lines(
          "  IMANI: // speaker note",
          "    IMANI:",
          "      What do they say?",
          "",
        ),
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
      expect(await insertConstructFromServer(view, "scene", endsDialogueBlock)).toBe(false);
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
    const result = insertConstructFromServer(view, "branch", endsDialogueBlock);
    resolve();
    expect(await result).toBe(true);
    expect(view.state.doc.toString()).toContain(
      lines("  Hello.", "  branch new_branch", "    ", "  end", "end"),
    );
  });

  it("inserts nothing when the script changed while the server answered", async () => {
    const { view, resolve } = pending();
    const result = insertConstructFromServer(view, "branch", endsDialogueBlock);
    view.dispatch({ changes: { from: 0, insert: LF } });
    resolve();
    expect(await result).toBe(false);
    expect(view.state.doc.toString()).toBe(LF + SOURCE);
  });

  it("never applies an answer to a script edited after it arrived", async () => {
    const { view, resolve } = pending();
    const outside = "store gold = 1";
    const result = insertConstructFromServer(view, "branch", endsDialogueBlock);
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
    const result = insertConstructFromServer(view, "branch", endsDialogueBlock);
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

describe("insertions checked against the reparsed script", () => {
  it("never writes a new Dialogue into a following multiline string", () => {
    const source = lines(
      'store example = ""',
      "scene start",
      "    & example = [[",
      "Example.",
      "    ]]",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const dialogue = apply(source, caretAt(source, "scene start"), "dialogue")!;
    expect(nodeNamesOf(dialogue.text)).toContain("BlockDialogue");
    expect(dialogue.text).toContain(
      lines("    & example = [[", "Example.", "    ]]"),
    );
    expect(dialogue.text.includes("[[" + LF + "Example.")).toBe(true);
    expect(dialogue.selected).toBe("CHARACTER");
  });

  it("never turns existing narration into the new cue's speech across a comment line", () => {
    const source = lines(
      "scene start",
      "  Before.",
      "// note",
      "    Existing narration.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    expect(nodeNamesOf(source)).not.toContain("BlockDialogue");
    const dialogue = apply(source, caretAt(source, "Before."), "dialogue")!;
    const tree = treeOf(dialogue.text);
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
      if (node.name === "BlockDialogue") {
        expect(dialogue.text.slice(node.from, node.to)).not.toContain(
          "Existing narration.",
        );
      }
    }
    expect(nodeNamesOf(dialogue.text)).toContain("BlockDialogue");
  });

  it.each([
    lines(
      "scene start",
      "  if true then",
      "    Hello.",
      "  else",
      "    Goodbye.",
      "  end",
      "end",
      "",
    ),
    lines("scene start", "  for i = 1, 2 do", "    Hello.", "  end", "end", ""),
    lines("scene start", "  while false do", "    Hello.", "  end", "end", ""),
    lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  IMANI:",
      "    Hello.",
      "",
      "// note",
      "    Goodbye.",
      "",
      "end",
      "",
    ),
  ])(
    "adds every text construct on every scene line without new problems: %s",
    (source) => {
      expect(diagnosticsOf(source)).toEqual([]);
      const start = source.indexOf("scene start");
      const lineStarts = [start];
      for (
        let at = source.indexOf(LF, start);
        at >= 0;
        at = source.indexOf(LF, at + 1)
      ) {
        if (at + 1 < source.length) lineStarts.push(at + 1);
      }
      for (const caret of lineStarts) {
        for (const construct of ["branch", "choose", "dialogue"] as const) {
          const result = apply(source, caret, construct);
          expect(result, construct + "@" + caret).not.toBeNull();
          const problems = diagnosticsOf(result!.text).filter(
            (message) => !message.startsWith("Cannot find character named"),
          );
          expect(problems, construct + "@" + caret + LF + result!.text).toEqual(
            [],
          );
        }
      }
    },
  );

  it.each([
    lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  if true then",
      "    IMANI:",
      "      Hello.",
      "  end",
      "end",
      "",
    ),
    lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  choose",
      "    + [Talk]",
      "      IMANI:",
      "        Hello.",
      "  end",
      "end",
      "",
    ),
  ])(
    "keeps the speaker of a dialogue nested in another block: %s",
    (source) => {
      expect(diagnosticsOf(source)).toEqual([]);
      const dialogue = apply(source, caretAt(source, "Hello."), "dialogue")!;
      const nestedInChoice = source.includes("choose");
      expect(dialogue.text).toContain(
        nestedInChoice
          ? lines("        Hello.", "      IMANI:", "        What do they say?")
          : lines("  end", "  IMANI:", "    What do they say?"),
      );
      expect(dialogue.inside).toBe(nestedInChoice ? "option" : "scene");
      expect(dialogue.selected).toBe("What do they say?");
      expect(diagnosticsOf(dialogue.text)).toEqual([]);
    },
  );

  it("writes Music with the language's loop clause", () => {
    const source = lines("scene start", "  Hello.", "end", "");
    const music = apply(source, caretAt(source, "Hello."), "music")!;
    expect(music.text).toContain("((play music music_name loop))");
    expect(music.selected).toBe("music_name");
    const problems = diagnosticsOf(music.text);
    expect(problems.some((message) => message.includes("looping"))).toBe(false);
    expect(
      problems.filter((message) => message.includes("music_name")),
    ).not.toEqual([]);
  });

  it("adds a Branch beside the branch the caret is in, never inside it", () => {
    const source = lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  branch hall",
      "    IMANI:",
      "      Hello.",
      "  end",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    for (const marker of ["branch hall", "Hello."]) {
      const branch = apply(source, caretAt(source, marker), "branch")!;
      expect(branch.text, marker).toBe(
        source.replace(
          lines("  end", "end"),
          lines("  end", "  branch new_branch", "    ", "  end", "end"),
        ),
      );
      expect(diagnosticsOf(branch.text), marker).toEqual([]);
    }
  });
});

describe("placement inside the construct at the caret", () => {
  const THEN = lines(
    "scene start",
    "  choose",
    "    Prompt?",
    "    + [First]",
    "      First path.",
    "  then",
    "    After one.",
    "    After two.",
    "  end",
    "  Later.",
    "end",
    "",
  );

  it("adds a story block inside a then clause, right after the caret's line", () => {
    expect(diagnosticsOf(THEN)).toEqual([]);
    const dialogue = apply(THEN, caretAt(THEN, "After one."), "dialogue")!;
    expect(dialogue.text).toBe(
      THEN.replace(
        "    After one." + LF,
        lines(
          "    After one.",
          "    CHARACTER:",
          "      What do they say?",
          "",
        ),
      ),
    );
    expect(dialogue.inside).toBe("then");
    const choose = apply(THEN, caretAt(THEN, "After one."), "choose")!;
    expect(choose.inside).toBe("then");
    expect(choose.text).toContain(lines("    After one.", "    choose"));
    expect(diagnosticsOf(choose.text)).toEqual([]);
  });

  it("adds a Branch beside the whole choice menu when the caret is in its then clause", () => {
    const branch = apply(THEN, caretAt(THEN, "After one."), "branch")!;
    expect(branch.text).toBe(
      THEN.replace(
        lines("  end", "  Later."),
        lines("  end", "  branch new_branch", "    ", "  end", "  Later."),
      ),
    );
    expect(branch.inside).toBe("scene");
    expect(diagnosticsOf(branch.text)).toEqual([]);
  });

  it("adds a story block inside an option, under its header", () => {
    const dialogue = apply(THEN, caretAt(THEN, "+ [First]"), "dialogue")!;
    expect(dialogue.text).toBe(
      THEN.replace(
        "    + [First]" + LF,
        lines(
          "    + [First]",
          "      CHARACTER:",
          "        What do they say?",
          "",
        ),
      ),
    );
    expect(dialogue.inside).toBe("option");
  });

  it("adds a story block inside a branch, after the caret's line", () => {
    const source = lines(
      "scene start",
      "  branch hall",
      "    Dark.",
      "    Darker.",
      "  end",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const choose = apply(source, caretAt(source, "Dark."), "choose")!;
    expect(choose.inside).toBe("branch");
    expect(choose.text).toContain(lines("    Dark.", "    choose"));
    expect(choose.text).toContain(lines("    end", "    Darker."));
    expect(diagnosticsOf(choose.text)).toEqual([]);
  });

  it("adds after the whole cue when the caret is inside a cue's dialogue", () => {
    const source = lines(
      "define IMANI as character with",
      '  name = "Imani"',
      "end",
      "",
      "scene start",
      "  IMANI:",
      "    Hello.",
      "    Again.",
      "  Later.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const dialogue = apply(source, caretAt(source, "Hello."), "dialogue")!;
    expect(dialogue.text).toBe(
      source.replace(
        "    Again." + LF,
        lines("    Again.", "  IMANI:", "    What do they say?", ""),
      ),
    );
    expect(dialogue.inside).toBe("scene");
    const branch = apply(source, caretAt(source, "Hello."), "branch")!;
    expect(branch.text).toContain(lines("    Again.", "  branch new_branch"));
    expect(diagnosticsOf(dialogue.text)).toEqual([]);
    expect(diagnosticsOf(branch.text)).toEqual([]);
  });
});

describe("a new cue and the lines after it", () => {
  const CUE = (indent: string) =>
    lines(`${indent}CHARACTER:`, `${indent}  What do they say?`);

  it("never takes a deeper-indented closing end of the scene", () => {
    const source = lines("scene start", "  Before.", "    end", "");
    expect(diagnosticsOf(source)).toEqual([]);
    for (const marker of ["Before.", "    end"]) {
      const dialogue = apply(source, caretAt(source, marker), "dialogue")!;
      expect(dialogue.text, marker).toBe(
        lines("scene start", "  Before.", CUE("    "), "    end", ""),
      );
      expect(diagnosticsOf(dialogue.text), marker).toEqual([
        "Cannot find character named `CHARACTER`",
      ]);
    }
  });

  it("never takes a deeper-indented closing end of a branch", () => {
    const source = lines(
      "scene start",
      "  branch hall",
      "    Dark.",
      "      end",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const dialogue = apply(source, caretAt(source, "Dark."), "dialogue")!;
    expect(dialogue.text).toBe(
      lines(
        "scene start",
        "  branch hall",
        "    Dark.",
        CUE("      "),
        "      end",
        "end",
        "",
      ),
    );
    expect(diagnosticsOf(dialogue.text)).toEqual([
      "Cannot find character named `CHARACTER`",
    ]);
  });

  it("stays right after the caret's statement when the next line ends a cue anyway", () => {
    const source = lines(
      "store x = 0",
      "scene start",
      "  Before.",
      "    & x = 1",
      "  Later.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const dialogue = apply(source, caretAt(source, "Before."), "dialogue")!;
    expect(dialogue.text).toBe(
      source.replace("  Before." + LF, lines("  Before.", CUE("  "), "")),
    );
  });

  it("stays right after the caret's statement and leaves deeper display text alone", () => {
    const source = lines(
      "scene start",
      "  Before.",
      "    Deeper narration.",
      "  Later.",
      "end",
      "",
    );
    expect(diagnosticsOf(source)).toEqual([]);
    const dialogue = apply(source, caretAt(source, "Before."), "dialogue")!;
    expect(dialogue.text).toBe(
      source.replace("  Before." + LF, lines("  Before.", CUE("    "), "")),
    );
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
      changes: { from: caretAt(SCRIPT, "quiet"), insert: "x" },
      userEvent: "input.type",
    });
    const typed = editor.state.doc.toString();
    expect(insertConstruct("choose", structureOf(typed))(editor)).toBe(true);
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
