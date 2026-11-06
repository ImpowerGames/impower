import { signal } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FindTextParams } from "@impower/spark-editor-protocol/src/protocols/workspace/FindTextMessage";
import type { Location, Range } from "vscode-languageserver-protocol";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});

const { default: WorkspaceSearch, renameNote } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceSearch"
);
const { INITIAL_SEARCH } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { buildConfiguration, PREFERENCES_SCHEMA, PROJECT_SETTINGS_SCHEMA } =
  await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");

const MAIN = "file:///p/main.sd";
const CHAPTER = "file:///p/chapter.sd";
const EPILOGUE = "file:///p/epilogue.sd";
const PORTRAIT = "file:///p/imani.png";
const PORTRAIT_NIGHT = "file:///p/imani@night.png";

const range = (line: number, from: number, to: number): Range => ({
  start: { line, character: from },
  end: { line, character: to },
});

const NEWLINE = String.fromCharCode(10);
const TEXTS: Record<string, string> = {
  [MAIN]: ["scene start", "  The rumour spread.", "end"].join(NEWLINE),
  [CHAPTER]: ["scene chapter", "  A rumour, another rumour.", "end"].join(NEWLINE),
  [EPILOGUE]: ["define imani as character with", "end"].join(NEWLINE),
};

const matchesFor = (query: string) =>
  query === "rumour"
    ? [
        { uri: CHAPTER, matches: [range(1, 4, 10), range(1, 20, 26)] },
        { uri: MAIN, matches: [range(1, 6, 12)] },
      ]
    : query === "another"
      ? [{ uri: CHAPTER, matches: [range(1, 12, 19)] }]
      : [];

const setup = (opened: string | undefined = MAIN) => {
  const openedUri = signal<string | undefined>(opened);
  const selection = signal<Range | undefined>(range(0, 0, 0));
  const autoRenameFiles = signal(true);
  const textListeners: (() => void)[] = [];
  const sources = {
    openedUri: () => openedUri.value,
    selection: () => selection.value,
    findText: vi.fn(async (params: FindTextParams) => {
      if (params.regex && params.query.includes("(")) {
        return { error: "Unterminated group" };
      }
      const scripts = matchesFor(params.query).map((s) => ({
        uri: s.uri,
        matches: s.matches.map((r) => ({
          range: r,
          lineText: TEXTS[s.uri]!.split(NEWLINE)[r.start.line]!,
          ...(params.replacement != null ? { replacement: params.replacement } : {}),
        })),
      }));
      return {
        total: scripts.reduce((n, s) => n + s.matches.length, 0),
        scripts,
      };
    }),
    references: vi.fn(async (): Promise<Location[]> => [
      { uri: MAIN, range: range(1, 6, 11) },
      { uri: EPILOGUE, range: range(0, 7, 12) },
    ]),
    definitions: vi.fn(async (): Promise<Location[]> => [
      { uri: EPILOGUE, range: range(0, 7, 12) },
    ]),
    prepareRename: vi.fn(async () => range(1, 6, 11)),
    renameEdits: vi.fn(async (_uri: string, _p: unknown, newName: string) => {
      if (newName === "zadie") {
        throw new Error("zadie is already a name in this story.");
      }
      return {
        documentChanges: [
          { kind: "rename" as const, oldUri: PORTRAIT, newUri: `file:///p/${newName}.png` },
        ],
      };
    }),
    fileReferences: vi.fn(async (uri: string): Promise<Location[]> =>
      uri === PORTRAIT
        ? [
            { uri: MAIN, range: range(1, 6, 11) },
            { uri: CHAPTER, range: range(1, 4, 9) },
          ]
        : [],
    ),
    files: vi.fn(async () => [
      { uri: MAIN, name: "main", type: "script" },
      { uri: PORTRAIT, name: "imani", type: "image" },
      { uri: PORTRAIT_NIGHT, name: "imani@night", type: "image" },
    ]),
    fileText: vi.fn(async (uri: string) =>
      uri === MAIN
        ? ["scene start", "  The imani spread.", "end"].join(NEWLINE)
        : (TEXTS[uri] ?? ""),
    ),
    applyEdit: vi.fn(async () => ({ applied: true })),
    openLocation: vi.fn(async () => {}),
    openAsset: vi.fn(async () => {}),
    showMatch: vi.fn(async (uri: string, r: Range) => {
      openedUri.value = uri;
      selection.value = r;
    }),
    setMatches: vi.fn(),
    autoRenameFiles: () => autoRenameFiles.value,
    onTextChanged: (listener: () => void) => {
      textListeners.push(listener);
      return () => {};
    },
    onEditorLoaded: () => () => {},
    onRenamed: vi.fn(async () => {}),
  };
  const search = new WorkspaceSearch(sources);
  return { search, sources, openedUri, selection, autoRenameFiles, textListeners };
};

let disposers: (() => void)[] = [];

beforeEach(() => {
  workspace.search.value = INITIAL_SEARCH;
});

afterEach(() => {
  disposers.forEach((d) => d());
  disposers = [];
});

const make = (opened?: string) => {
  const made = setup(opened);
  disposers.push(() => made.search.dispose());
  return made;
};

describe("Find across every script", () => {
  it("groups the matches per script with Main first and counts every script", async () => {
    const { search } = make();
    search.open("find");
    await search.setTerm("rumour");
    const snapshot = workspace.search.value;
    expect(snapshot.groups.map((g) => [g.uri, g.uses.length])).toEqual([
      [MAIN, 1],
      [CHAPTER, 2],
    ]);
    expect(snapshot.total).toBe(3);
    expect(search.count()).toEqual({ index: 1, total: 3, scripts: 2 });
  });

  it("counts from the top of the open script before the editor has reported a caret", async () => {
    const { search, selection } = make(MAIN);
    selection.value = undefined;
    search.open("find");
    await search.setTerm("rumour");
    expect(search.count()).toEqual({ index: 1, total: 3, scripts: 2 });
  });

  it("passes the three switches to the server", async () => {
    const { search, sources } = make();
    search.open("find");
    await search.setTerm("rumour");
    await search.toggleOption("matchCase");
    await search.toggleOption("wholeWord");
    await search.toggleOption("regex");
    expect(sources.findText).toHaveBeenLastCalledWith({
      query: "rumour",
      matchCase: true,
      wholeWord: true,
      regex: true,
    });
  });

  it("reads 1 of 1 from Main when the only match is in another script, before and after Enter", async () => {
    const { search, sources } = make(MAIN);
    search.open("find");
    await search.setTerm("another");
    expect(search.count()).toEqual({ index: 1, total: 1, scripts: 1 });
    await search.step();
    expect(sources.showMatch).toHaveBeenCalledWith(CHAPTER, range(1, 12, 19));
    expect(search.count()).toEqual({ index: 1, total: 1, scripts: 1 });
  });

  it("steps through the open script, then the next script, and wraps", async () => {
    const { search, sources, selection } = make(MAIN);
    search.open("find");
    await search.setTerm("rumour");
    selection.value = range(1, 6, 12);
    expect(search.count().index).toBe(1);
    await search.step();
    expect(sources.showMatch).toHaveBeenLastCalledWith(CHAPTER, range(1, 4, 10));
    expect(search.count().index).toBe(2);
    await search.step();
    expect(sources.showMatch).toHaveBeenLastCalledWith(CHAPTER, range(1, 20, 26));
    await search.step();
    expect(sources.showMatch).toHaveBeenLastCalledWith(MAIN, range(1, 6, 12));
    await search.step(true);
    expect(sources.showMatch).toHaveBeenLastCalledWith(CHAPTER, range(1, 20, 26));
  });

  it("reports a pattern it cannot read and finds nothing", async () => {
    const { search } = make();
    search.open("find");
    await search.toggleOption("regex");
    await search.setTerm("rumour(");
    expect(workspace.search.value).toMatchObject({
      error: "Unterminated group",
      total: 0,
      groups: [],
    });
  });

  it("lights up the open script's matches and clears them when the search closes", async () => {
    const { search, sources } = make(MAIN);
    search.open("find");
    await search.setTerm("rumour");
    expect(sources.setMatches).toHaveBeenLastCalledWith(MAIN, [range(1, 6, 12)]);
    search.close();
    expect(sources.setMatches).toHaveBeenLastCalledWith(MAIN, []);
  });

  it("searches again when a script changes while the search is open", async () => {
    const { search, sources, textListeners } = make();
    search.open("find");
    await search.setTerm("rumour");
    sources.findText.mockClear();
    textListeners.forEach((l) => l());
    expect(sources.findText).toHaveBeenCalledTimes(1);
  });
});

describe("Replace", () => {
  it("replaces every match as one edit per script and says how many", async () => {
    const { search, sources } = make();
    search.open("find");
    await search.setTerm("rumour");
    search.setReplacement("tale");
    await search.replaceAll();
    expect(sources.applyEdit).toHaveBeenCalledTimes(1);
    const [edit] = sources.applyEdit.mock.calls[0]! as unknown as [
      { documentChanges: { textDocument: { uri: string }; edits: { newText: string }[] }[] },
    ];
    expect(
      edit.documentChanges.map((c) => [c.textDocument.uri, c.edits.map((e) => e.newText)]),
    ).toEqual([
      [CHAPTER, ["tale", "tale"]],
      [MAIN, ["tale"]],
    ]);
    expect(workspace.search.value.status).toBe("Replaced 3 matches in 2 scripts");
  });

  it("replaces only the selected match, then moves to the next one", async () => {
    const { search, sources, selection } = make(MAIN);
    search.open("find");
    await search.setTerm("rumour");
    search.setReplacement("tale");
    selection.value = range(1, 6, 12);
    await search.replaceOne();
    const [edit] = sources.applyEdit.mock.calls[0]! as unknown as [
      { documentChanges: { textDocument: { uri: string }; edits: unknown[] }[] },
    ];
    expect(edit.documentChanges).toEqual([
      {
        textDocument: { uri: MAIN, version: null },
        edits: [{ range: range(1, 6, 12), newText: "tale" }],
      },
    ]);
    expect(sources.showMatch).toHaveBeenLastCalledWith(CHAPTER, range(1, 4, 10));
  });

  it("selects the next match first when the selection is on none", async () => {
    const { search, sources } = make(MAIN);
    search.open("find");
    await search.setTerm("rumour");
    await search.replaceOne();
    expect(sources.applyEdit).not.toHaveBeenCalled();
    expect(sources.showMatch).toHaveBeenCalledWith(MAIN, range(1, 6, 12));
  });

  it("asks for words first when the Find field is empty", async () => {
    const { search, sources } = make();
    search.open("find");
    await search.replaceAll();
    expect(sources.applyEdit).not.toHaveBeenCalled();
    expect(workspace.search.value.status).toBe("Enter words to find first.");
  });
});

describe("References", () => {
  it("merges the name's uses with the uses of every asset file it names, once each", async () => {
    const { search, sources } = make(MAIN);
    await search.openReferences();
    const snapshot = workspace.search.value;
    expect(snapshot.view).toBe("references");
    expect(snapshot.subject).toMatchObject({ name: "imani", character: true });
    expect(sources.fileReferences.mock.calls.map((c) => c[0])).toEqual([
      PORTRAIT,
    ]);
    expect(
      snapshot.references.map((g) => [
        g.uri,
        g.uses.map((u) => [u.range.start.line, u.range.start.character, !!u.declaration]),
      ]),
    ).toEqual([
      [MAIN, [[1, 6, false]]],
      [CHAPTER, [[1, 4, false]]],
      [EPILOGUE, [[0, 7, true]]],
    ]);
    expect(snapshot.files).toEqual([PORTRAIT]);
  });

  it("lists an asset's uses from its row without a caret", async () => {
    const { search, sources } = make(MAIN);
    await search.openReferences({ name: "imani", character: false });
    expect(sources.references).not.toHaveBeenCalled();
    expect(workspace.search.value.references.map((g) => g.uri)).toEqual([
      MAIN,
      CHAPTER,
    ]);
  });
});

describe("Rename", () => {
  it("gathers what a rename will change: the uses, their scripts, the files and whether it is a character", async () => {
    const { search } = make(MAIN);
    await search.openRename();
    const { subject, references, files, renameName } = workspace.search.value;
    expect(renameName).toBe("imani");
    const uses = references.reduce((n, g) => n + g.uses.length, 0);
    expect(renameNote(subject, uses, references.length, files.length)).toBe(
      "Changes 3 uses in 3 scripts and renames 1 file in your assets. The same word in dialogue and action stays as it is. Cues keep their capitals.",
    );
    expect(renameNote(subject, uses, references.length, 0)).toBe(
      "Changes 3 uses in 3 scripts. The same word in dialogue and action stays as it is. Cues keep their capitals.",
    );
    expect(renameNote({ name: "start", character: false }, 1, 1, 0)).toBe(
      "Changes 1 use in 1 script. The same word in dialogue and action stays as it is.",
    );
  });

  it("applies the server's rename, files included, and closes", async () => {
    const { search, sources } = make(MAIN);
    await search.openRename();
    search.setRenameName("amara");
    expect(await search.rename()).toBe(true);
    expect(sources.applyEdit).toHaveBeenCalledWith(
      {
        documentChanges: [
          { kind: "rename", oldUri: PORTRAIT, newUri: "file:///p/amara.png" },
        ],
      },
      "Rename imani to amara",
    );
    expect(sources.onRenamed).toHaveBeenCalled();
    expect(workspace.search.value.open).toBe(false);
  });

  it("shows the server's reason and changes nothing when the name is taken", async () => {
    const { search, sources } = make(MAIN);
    await search.openRename();
    search.setRenameName("zadie");
    expect(await search.rename()).toBe(false);
    expect(sources.applyEdit).not.toHaveBeenCalled();
    expect(workspace.search.value).toMatchObject({
      status: "zadie is already a name in this story.",
      statusTone: "error",
      open: true,
    });
  });
});

describe("edits and steps never act on stale results", () => {
  it("runs two Replace alls one after the other and refuses the second when the server's ranges are stale", async () => {
    const { search, sources } = make(MAIN);
    const files: Record<string, string> = { [CHAPTER]: "rumour!" };
    sources.findText.mockImplementation(async (params: FindTextParams) => ({
      total: 1,
      scripts: [
        {
          uri: CHAPTER,
          matches: [
            {
              range: range(0, 0, 6),
              lineText: "rumour!",
              ...(params.replacement != null ? { replacement: params.replacement } : {}),
            },
          ],
        },
      ],
    }));
    sources.fileText.mockImplementation(async (uri: string) => files[uri] ?? "");
    sources.applyEdit.mockImplementation(async (edit: unknown) => {
      const [change] = (edit as { documentChanges: { textDocument: { uri: string }; edits: { range: Range; newText: string }[] }[] }).documentChanges;
      await new Promise((resolve) => setTimeout(resolve, 5));
      const { uri } = change!.textDocument;
      const text = files[uri]!;
      const [e] = change!.edits;
      files[uri] = text.slice(0, e!.range.start.character) + e!.newText + text.slice(e!.range.end.character);
      return { applied: true };
    });
    search.open("find");
    await search.setTerm("rumour");
    search.setReplacement("x");
    await Promise.all([search.replaceAll(), search.replaceAll()]);
    expect(files[CHAPTER]).toBe("x!");
    expect(sources.applyEdit).toHaveBeenCalledTimes(1);
    expect(workspace.search.value).toMatchObject({
      status: "A script changed while replacing. Nothing was replaced; try again.",
      statusTone: "error",
    });
  });

  it("steps with the results of the words in the field, waiting for them", async () => {
    const { search, sources } = make(MAIN);
    search.open("find");
    await search.setTerm("another");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = sources.findText.getMockImplementation()!;
    sources.findText.mockImplementation(async (params: FindTextParams) => {
      if (params.query === "rumour") {
        await gate;
      }
      return real(params);
    });
    void search.setTerm("rumour");
    const stepping = search.step();
    release();
    await stepping;
    expect(sources.showMatch).toHaveBeenLastCalledWith(MAIN, range(1, 6, 12));
    expect(sources.showMatch).not.toHaveBeenCalledWith(CHAPTER, range(1, 12, 19));
  });

  it("refuses a rename whose name is no longer at its place", async () => {
    const { search, sources } = make(MAIN);
    await search.openRename();
    sources.fileText.mockImplementation(async () =>
      ["scene start", "  The zadie spread.", "end"].join(NEWLINE),
    );
    search.setRenameName("amara");
    expect(await search.rename()).toBe(false);
    expect(sources.renameEdits).not.toHaveBeenCalled();
    expect(workspace.search.value.status).toBe(
      "The script changed and imani is no longer there. Open Rename again.",
    );
  });
});

describe("Auto-rename files", () => {
  it("reaches the language server's configuration as editor.autoRenameFiles", () => {
    const defaults = (schema: Record<string, { default: unknown }>) =>
      Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, v.default]));
    const preferences = { ...defaults(PREFERENCES_SCHEMA), autoRenameFiles: false };
    expect(
      buildConfiguration(preferences as never, defaults(PROJECT_SETTINGS_SCHEMA) as never),
    ).toMatchObject({ editor: { autoRenameFiles: false } });
  });
});
