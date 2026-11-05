import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadFile = vi.hoisted(() => vi.fn());
vi.mock("../../src/modules/spark-editor/utils/downloadFile", () => ({ downloadFile }));
vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({
  recordMove: vi.fn(),
  recordTrashDeletion: vi.fn(async () => undefined),
}));

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: WorkspaceScripts } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceScripts"
);
const { scriptRows } = await import(
  "../../src/modules/spark-editor/workspace/scriptsListing"
);
const { NAME_MESSAGES } = await import(
  "../../src/modules/spark-editor/utils/fileListModel"
);

const PROJECT = "p";
const uri = (path: string) => `file:///${PROJECT}/${path}`;
const relative = (u: string) => u.slice(`file:///${PROJECT}/`.length);

function fakeWorkspace(paths: string[], folders: string[]) {
  const files = new Map(paths.map((p) => [p, `text of ${p}`]));
  const dirs = new Set(folders);
  const open = new Set<string>();
  const fs = {
    getFiles: vi.fn(async () =>
      Object.fromEntries(
        [...files.keys()].map((p) => [
          uri(p),
          { uri: uri(p), size: files.get(p)!.length, modified: 1000 },
        ]),
      ),
    ),
    getFolders: vi.fn(async () => [...dirs].sort()),
    getFileUri: (_: string, path: string) => uri(path),
    getRelativePath: (_: string, u: string) => relative(u),
    createFiles: vi.fn(async ({ files: created }: { files: { uri: string; data: ArrayBuffer | string }[] }) => {
      for (const f of created) files.set(relative(f.uri), String(f.data));
      return [];
    }),
    createFolder: vi.fn(async (_: string, path: string) => {
      dirs.add(path);
      return [path];
    }),
    moveFile: vi.fn(async (_: string, from: string, to: string) => {
      files.set(to, files.get(from)!);
      files.delete(from);
      return [{ type: "script" }];
    }),
    moveFolder: vi.fn(async (_: string, from: string, to: string) => {
      for (const p of [...files.keys()]) {
        if (p.startsWith(`${from}/`)) {
          files.set(to + p.slice(from.length), files.get(p)!);
          files.delete(p);
        }
      }
      dirs.delete(from);
      dirs.add(to);
      return [];
    }),
    readFile: vi.fn(async ({ file }: { file: { uri: string } }) => files.get(relative(file.uri))),
    zipFiles: vi.fn(async () => "zip bytes"),
    deleteFiles: vi.fn(async ({ files: gone }: { files: { uri: string }[] }) => {
      for (const f of gone) files.delete(relative(f.uri));
      return [];
    }),
    deleteFolder: vi.fn(async () => ({ files: [], folders: [] })),
  };
  const ls = {
    getScriptReferences: vi.fn(async () => [
      { from: uri("main.sd"), to: uri("Scripts/intro.sd"), divert: true },
    ]),
  };
  const window = {
    recordScriptChange: vi.fn(async () => undefined),
    recordAssetChange: vi.fn(async () => undefined),
    openFileEditor: vi.fn(),
    getActiveEditorForFile: vi.fn((path: string) => (open.has(path) ? { open: true } : undefined)),
  };
  const scripts = new WorkspaceScripts({ fs, ls, window } as never);
  return { scripts, fs, ls, window, files, dirs, open };
}

const PATHS = [
  "main.sd",
  "Scripts/intro.sd",
  "Scripts/outro.sd",
  "Scripts/Drafts/old.sd",
  "Assets/Images/hero.png",
];
const FOLDERS = ["Assets", "Assets/Images", "Scripts", "Scripts/Drafts", "Scripts/Empty"];

beforeEach(() => {
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
  };
  workspace.scriptListing.value = null;
  workspace.scriptReferences.value = [];
  downloadFile.mockReset();
});

describe("Scripts through the workspace", () => {
  it("loads the scripts, their folders and the language server's references as project paths", async () => {
    const { scripts } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(Object.keys(workspace.scriptListing.value!.files).sort()).toEqual([
      "Scripts/Drafts/old.sd",
      "Scripts/intro.sd",
      "Scripts/outro.sd",
      "main.sd",
    ]);
    expect(workspace.scriptReferences.value).toEqual([
      { from: "main.sd", to: "Scripts/intro.sd", divert: true },
    ]);
  });

  it("refuses a new script named con with the reserved-name message", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    await expect(scripts.create("script", "", "con")).rejects.toThrow(NAME_MESSAGES.reserved);
    expect(fs.createFiles).not.toHaveBeenCalled();
  });

  it("creates a script in the Scripts folder when the browser is at its root", async () => {
    const { scripts, files } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(await scripts.create("script", "", "chapter two")).toBe("Scripts/chapter two.sd");
    expect(files.has("Scripts/chapter two.sd")).toBe(true);
  });

  it("refuses a rename to a name in use and renames otherwise, following an open editor", async () => {
    const { scripts, fs, window, open } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    await expect(scripts.rename("Scripts/intro.sd", "Outro")).rejects.toThrow(NAME_MESSAGES.taken);
    open.add("Scripts/intro.sd");
    expect(await scripts.rename("Scripts/intro.sd", "opening")).toBe("Scripts/opening.sd");
    expect(fs.moveFile).toHaveBeenCalledWith(PROJECT, "Scripts/intro.sd", "Scripts/opening.sd");
    expect(window.openFileEditor).toHaveBeenCalledWith("Scripts/opening.sd", "Scripts/intro.sd");
    await expect(scripts.rename("main.sd", "start")).rejects.toThrow("Main stays");
  });

  it("moves a script or a folder into another folder, never a folder inside itself", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(await scripts.move("Scripts/outro.sd", "Scripts/Drafts")).toBe("Scripts/Drafts/outro.sd");
    expect(fs.moveFile).toHaveBeenCalledWith(PROJECT, "Scripts/outro.sd", "Scripts/Drafts/outro.sd");
    expect(await scripts.move("Scripts/Drafts", "Scripts/Empty")).toBe("Scripts/Empty/Drafts");
    expect(fs.moveFolder).toHaveBeenCalledWith(PROJECT, "Scripts/Drafts", "Scripts/Empty/Drafts");
    await expect(scripts.move("Scripts/Empty", "Scripts/Empty/Drafts")).rejects.toThrow("inside itself");
  });

  it("duplicates a script as '<name> copy' beside it", async () => {
    const { scripts, files } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(await scripts.duplicate("Scripts/intro.sd")).toBe("Scripts/intro copy.sd");
    expect(files.get("Scripts/intro copy.sd")).toBe("text of Scripts/intro.sd");
    expect(await scripts.duplicate("Scripts/intro.sd")).toBe("Scripts/intro copy 2.sd");
  });

  it("downloads a script as its file and a folder as a zip", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    await scripts.download("Scripts/intro.sd");
    expect(downloadFile).toHaveBeenCalledWith("intro.sd", "text/plain", "text of Scripts/intro.sd");
    await scripts.download("Scripts/Drafts");
    expect(fs.zipFiles).toHaveBeenCalledWith({
      files: [{ uri: uri("Scripts/Drafts/old.sd"), path: "old.sd" }],
    });
    expect(downloadFile).toHaveBeenLastCalledWith("Drafts.zip", "application/zip", "zip bytes");
  });

  it("deletes a script to the recycle bin and never Main", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    await scripts.remove("Scripts/outro.sd");
    expect(fs.deleteFiles).toHaveBeenCalledWith({ files: [{ uri: uri("Scripts/outro.sd") }], mode: "trash" });
    await expect(scripts.remove("main.sd")).rejects.toThrow("Main stays");
  });
});

describe("browsing one folder at a time", () => {
  const listing = {
    files: {
      "main.sd": { modified: 1, size: 10 },
      "scripts/intro.sd": { modified: 2, size: 20 },
      "scripts/Drafts/old.sd": { modified: 3, size: 30 },
    },
    folders: ["scripts", "scripts/Drafts", "scripts/Empty"],
  };

  it("opens on the lower-case scripts folder with Main pinned, folders, then scripts", () => {
    const rows = scriptRows({ listing, references: [], folder: "", query: "", sort: "name-asc" });
    expect(rows.map((r) => [r.name, r.holdings ?? ""])).toEqual([
      ["Main", ""],
      ["Drafts", "1 script"],
      ["Empty", "Empty"],
      ["intro.sd", ""],
    ]);
  });

  it("searches every folder by name or path and says where each result lives", () => {
    const rows = scriptRows({ listing, references: [], folder: "", query: "drafts old", sort: "name-asc" });
    expect(rows.map((r) => [r.path, r.location])).toEqual([["scripts/Drafts/old.sd", "Drafts"]]);
  });

  it("counts a script's references and story position from the language server's references", () => {
    const references = [
      { from: "main.sd", to: "scripts/Drafts/old.sd", divert: true },
      { from: "scripts/intro.sd", to: "scripts/Drafts/old.sd", divert: false },
    ];
    const rows = scriptRows({ listing, references, folder: "scripts/Drafts", query: "", sort: "uses-desc" });
    expect(rows.map((r) => [r.name, r.uses, r.position])).toEqual([["old.sd", 2, 1]]);
  });
});
