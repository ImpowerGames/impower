import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "p";
const uri = (path: string) => `file:///${PROJECT}/${path}`;
const relative = (u: string) => u.slice(`file:///${PROJECT}/`.length);
const stem = (path: string) => path.split("/").pop()!.replace(/\.[^.]+$/, "");

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  autoRenameFiles: true,
}));

function referencesTo(path: string) {
  const name = stem(path);
  return [...state.files.entries()]
    .filter(([p, text]) => p.endsWith(".sd") && new RegExp(`\\b${name}\\b`).test(text))
    .map(([p]) => ({ uri: uri(p) }));
}

const fs = vi.hoisted(() => ({}) as Record<string, unknown>);
Object.assign(fs, {
  getFiles: async () =>
    Object.fromEntries(
      [...state.files.keys()].map((p) => [uri(p), { uri: uri(p), size: 1, modified: 1, src: `/src/${p}` }]),
    ),
  getFolders: async () => ["Assets", "Assets/Images"],
  getFileUri: (_: string, path: string) => uri(path),
  getFilename: (u: string) => u.split("/").pop()!,
  getRelativePath: (_: string, u: string) => relative(u),
  moveFile: vi.fn(async (_: string, from: string, to: string) => {
    if (state.files.has(to)) throw new Error(`${to} already exists`);
    state.files.set(to, state.files.get(from)!);
    state.files.delete(from);
    return [];
  }),
  renameFileWithReferences: vi.fn(async (_: string, from: string, to: string) => {
    const pattern = new RegExp(`\\b${stem(from)}\\b`, "g");
    let referencesUpdated = 0;
    for (const [p, text] of state.files) {
      if (!p.endsWith(".sd")) continue;
      const next = text.replace(pattern, () => {
        referencesUpdated += 1;
        return stem(to);
      });
      state.files.set(p, next);
    }
    const renamed = referencesUpdated > 0 ? from.slice(0, from.lastIndexOf("/") + 1) + to.split("/").pop() : to;
    if (renamed !== from) {
      state.files.set(renamed, state.files.get(from)!);
      state.files.delete(from);
    }
    return { referencesUpdated, scriptsAffected: referencesUpdated > 0 ? 1 : 0 };
  }),
});
const ls = { getFileReferences: async (u: string) => referencesTo(relative(u)), getScriptReferences: async () => [] };
const window = {
  recordScriptChange: async () => undefined,
  recordAssetChange: async () => undefined,
  getActiveEditorForFile: () => undefined,
  openFileEditor: () => undefined,
};

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs, ls, window, autoRenameFiles: () => state.autoRenameFiles },
}));

const { default: WorkspaceAssets } = await import("../../src/modules/spark-editor/workspace/WorkspaceAssets");
const { default: WorkspaceScripts } = await import("../../src/modules/spark-editor/workspace/WorkspaceScripts");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { undo, redo, clearUndoHistory } = await import("../../src/modules/spark-editor/utils/undoManager");

const deps = { fs, ls, window, autoRenameFiles: () => state.autoRenameFiles } as never;

const referenced = (script: string, verb: string) =>
  state.files.get(script)!.match(new RegExp(`${verb} (\\w+)`))![1]!;
const stems = () => [...state.files.keys()].map(stem);

describe("undoing a rename after a script starts using the file", () => {
  beforeEach(() => {
    clearUndoHistory();
    vi.clearAllMocks();
    state.autoRenameFiles = true;
    workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: PROJECT } };
  });

  it("keeps an asset reference intact through undo and redo", async () => {
    state.files = new Map([
      ["Assets/Images/hero.png", "png"],
      ["main.sd", ""],
    ]);
    const assets = new WorkspaceAssets(deps);
    await assets.load();
    expect(await assets.rename("Assets/Images/hero.png", "ada")).toBe("Assets/Images/ada.png");
    state.files.set("main.sd", "[[show backdrop ada]]");

    expect(await undo()).toBe(true);
    expect(state.files.has("Assets/Images/hero.png")).toBe(true);
    expect(stems()).toContain(referenced("main.sd", "backdrop"));

    expect(await redo()).toBe(true);
    expect(state.files.has("Assets/Images/ada.png")).toBe(true);
    expect(stems()).toContain(referenced("main.sd", "backdrop"));
  });

  it("keeps an include intact when a Scripts page rename is undone", async () => {
    state.files = new Map([
      ["Scripts/intro.sd", "hello"],
      ["main.sd", ""],
    ]);
    const scripts = new WorkspaceScripts(deps);
    await scripts.load();
    expect(await scripts.rename("Scripts/intro.sd", "opening")).toBe("Scripts/opening.sd");
    state.files.set("main.sd", "include opening");

    expect(await undo()).toBe(true);
    expect(state.files.has("Scripts/intro.sd")).toBe(true);
    expect(stems()).toContain(referenced("main.sd", "include"));
  });

  it("moves a referenced script to another folder and back with the setting on", async () => {
    state.files = new Map([
      ["Scripts/intro.sd", "hello"],
      ["main.sd", "include intro"],
    ]);
    const scripts = new WorkspaceScripts(deps);
    await scripts.load();
    expect(await scripts.move(["Scripts/intro.sd"], "Scripts/Drafts")).toEqual(["Scripts/Drafts/intro.sd"]);
    expect(state.files.has("Scripts/Drafts/intro.sd")).toBe(true);
    expect(state.files.has("Scripts/intro.sd")).toBe(false);
    expect(await undo()).toBe(true);
    expect(state.files.has("Scripts/intro.sd")).toBe(true);
    expect(state.files.get("main.sd")).toBe("include intro");
  });

  it("still uses a plain move when the setting is off", async () => {
    state.autoRenameFiles = false;
    state.files = new Map([
      ["Assets/Images/hero.png", "png"],
      ["main.sd", ""],
    ]);
    const assets = new WorkspaceAssets(deps);
    await assets.load();
    await assets.rename("Assets/Images/hero.png", "ada");
    state.files.set("main.sd", "[[show backdrop ada]]");
    expect(await undo()).toBe(true);
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
    expect(state.files.get("main.sd")).toBe("[[show backdrop ada]]");
  });
});
