import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage";
import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadFile = vi.hoisted(() => vi.fn());
const recordCreate = vi.hoisted(() => vi.fn());
vi.mock("../../src/modules/spark-editor/utils/downloadFile", () => ({ downloadFile }));
vi.mock("../../src/modules/spark-editor/utils/fileUndo", async (original) => ({
  renameFile: (await original<typeof import("../../src/modules/spark-editor/utils/fileUndo")>()).renameFile,
  recordMove: vi.fn(),
  recordCreate,
  recordTrashDeletion: vi.fn(async () => undefined),
}));

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: WorkspaceScripts, PROJECT_CHANGED, SCRIPTS_LOADING } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceScripts"
);
const { scriptRows } = await import(
  "../../src/modules/spark-editor/workspace/scriptsListing"
);
const { NAME_MESSAGES } = await import(
  "../../src/modules/spark-editor/utils/fileListModel"
);
const { SCRIPT_FILES_GLOB, setScriptFiles } = await import(
  "../../src/modules/spark-editor/utils/scriptFiles"
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
  const scripts = new WorkspaceScripts({ fs, ls, window, autoRenameFiles: () => false } as never);
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
    expect(workspace.scriptListing.value!.projectId).toBe(PROJECT);
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

  it("refuses a new folder named con with the reserved-name message", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    await expect(scripts.createFolder("", "con")).rejects.toThrow(NAME_MESSAGES.reserved);
    expect(fs.createFolder).not.toHaveBeenCalled();
  });

  it("creates an empty Untitled script in the Scripts folder when the browser is at its root, and records it for Undo", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script.sd");
    const [created] = fs.createFiles.mock.calls[0]![0].files;
    expect(created!.uri).toBe(uri("Scripts/Untitled script.sd"));
    expect((created!.data as ArrayBuffer).byteLength).toBe(0);
    expect(recordCreate).toHaveBeenCalledWith(PROJECT, [uri("Scripts/Untitled script.sd")], "Untitled script.sd");
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script 2.sd");
  });

  it("gives scripts created at the same time a name each, each recorded once for Undo", async () => {
    const { scripts } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    recordCreate.mockClear();
    const created = await Promise.all([scripts.createScript(""), scripts.createScript("")]);
    expect(created).toEqual(["Scripts/Untitled script.sd", "Scripts/Untitled script 2.sd"]);
    expect(recordCreate.mock.calls.map(([, uris]) => uris)).toEqual([
      [uri("Scripts/Untitled script.sd")],
      [uri("Scripts/Untitled script 2.sd")],
    ]);
  });

  it("reads the scripts before naming a script created while the list is still loading, never writing over one", async () => {
    const { scripts, files } = fakeWorkspace([...PATHS, "Scripts/Untitled script.sd"], FOLDERS);
    workspace.scriptListing.value = null;
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script 2.sd");
    expect(files.get("Scripts/Untitled script.sd")).toBe("text of Scripts/Untitled script.sd");
  });

  it("reads the scripts again when a read fails, and refuses with the message, adding nothing, only when every read fails", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    workspace.scriptListing.value = null;
    fs.getFiles.mockRejectedValueOnce(new Error("Project not loaded: p"));
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script.sd");
    workspace.scriptListing.value = null;
    fs.getFiles.mockRejectedValue(new Error("Project not loaded: p"));
    await expect(scripts.createScript("")).rejects.toThrow(SCRIPTS_LOADING);
    expect(fs.createFiles).toHaveBeenCalledTimes(1);
  });

  it("names past a script it has just written that the file list does not show yet", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    const before = await fs.getFiles();
    fs.getFiles.mockImplementation(async () => before);
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script.sd");
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script 2.sd");
  });

  it("stops counting a written script once the list shows it, or once it is deleted or renamed first", async () => {
    const { scripts, fs, files } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    const unlisted = () => [...(scripts as unknown as { unlisted: Set<string> }).unlisted];
    const current = fs.getFiles.getMockImplementation()!;
    const before = await fs.getFiles();
    fs.getFiles.mockImplementation(async () => before);
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script.sd");
    expect(unlisted()).toEqual(["Scripts/Untitled script.sd"]);
    files.delete("Scripts/Untitled script.sd");
    sendProtocolMessage(DidDeleteFilesMessage.type.notification({ files: [{ uri: uri("Scripts/Untitled script.sd") }] }));
    expect(unlisted()).toEqual([]);
    expect(await scripts.createScript("Scripts/Drafts")).toBe("Scripts/Drafts/Untitled script.sd");
    sendProtocolMessage(
      DidRenameFilesMessage.type.notification({
        files: [{ oldUri: uri("Scripts/Drafts"), newUri: uri("Scripts/Old drafts") }],
      }),
    );
    expect(unlisted()).toEqual([]);
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script.sd");
    fs.getFiles.mockImplementation(current);
    await scripts.load();
    expect(unlisted()).toEqual([]);
  });

  it("runs the next waiting create after one ahead of it fails, which keeps no name", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    fs.createFiles.mockRejectedValueOnce(new Error("disk full"));
    const [failed, next] = await Promise.allSettled([scripts.createScript(""), scripts.createScript("")]);
    expect(failed).toMatchObject({ status: "rejected", reason: new Error("disk full") });
    expect(next).toEqual({ status: "fulfilled", value: "Scripts/Untitled script.sd" });
  });

  it("refuses a waiting create once another project has opened, adding nothing", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    let release!: () => void;
    fs.createFiles.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([]); }));
    const first = scripts.createScript("");
    const waiting = scripts.createScript("");
    await vi.waitFor(() => expect(fs.createFiles).toHaveBeenCalledTimes(1));
    workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "other" } };
    release();
    await expect(first).resolves.toBe("Scripts/Untitled script.sd");
    await expect(waiting).rejects.toThrow(PROJECT_CHANGED);
    expect(fs.createFiles).toHaveBeenCalledTimes(1);
  });

  it("gives copies duplicated at the same time a name each", async () => {
    const { scripts, files } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    const copies = await Promise.all([scripts.duplicate("Scripts/intro.sd"), scripts.duplicate("Scripts/intro.sd")]);
    expect(copies).toEqual(["Scripts/intro copy.sd", "Scripts/intro copy 2.sd"]);
    expect(files.has("Scripts/intro copy 2.sd")).toBe(true);
  });

  it("numbers a new script past a folder holding its name, and keeps it beside a folder named without the ending", async () => {
    const { scripts } = fakeWorkspace(PATHS, [...FOLDERS, "Scripts/Untitled script.sd", "Scripts/Drafts/Untitled script"]);
    await scripts.load();
    expect(await scripts.createScript("")).toBe("Scripts/Untitled script 2.sd");
    expect(await scripts.createScript("Scripts/Drafts")).toBe("Scripts/Drafts/Untitled script.sd");
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
    const { scripts, fs, window } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(await scripts.move(["Scripts/outro.sd"], "Scripts/Drafts")).toEqual(["Scripts/Drafts/outro.sd"]);
    expect(fs.moveFile).toHaveBeenCalledWith(PROJECT, "Scripts/outro.sd", "Scripts/Drafts/outro.sd");
    expect(await scripts.move(["Scripts/Drafts"], "Scripts/Empty")).toEqual(["Scripts/Empty/Drafts"]);
    expect(fs.moveFolder).toHaveBeenCalledWith(PROJECT, "Scripts/Drafts", "Scripts/Empty/Drafts");
    expect(window.recordScriptChange).toHaveBeenCalledTimes(2);
    expect(window.recordAssetChange).toHaveBeenCalledTimes(1);
    await expect(scripts.move(["Scripts/Empty"], "Scripts/Empty/Drafts")).rejects.toThrow("inside itself");
  });

  it("duplicates a script as '<name> copy' beside it", async () => {
    const { scripts, files } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(await scripts.duplicate("Scripts/intro.sd")).toBe("Scripts/intro copy.sd");
    expect(files.get("Scripts/intro copy.sd")).toBe("text of Scripts/intro.sd");
    expect(await scripts.duplicate("Scripts/intro.sd")).toBe("Scripts/intro copy 2.sd");
  });

  it("duplicates a folder as '<name> copy' with its subfolders and scripts", async () => {
    const { scripts, files, dirs } = fakeWorkspace(
      [...PATHS, "Scripts/Drafts/Old/older.sd"],
      [...FOLDERS, "Scripts/Drafts/Old", "Scripts/Drafts/Empty"],
    );
    await scripts.load();
    expect(await scripts.duplicate("Scripts/Drafts")).toBe("Scripts/Drafts copy");
    expect(files.get("Scripts/Drafts copy/old.sd")).toBe("text of Scripts/Drafts/old.sd");
    expect(files.get("Scripts/Drafts copy/Old/older.sd")).toBe("text of Scripts/Drafts/Old/older.sd");
    expect(dirs.has("Scripts/Drafts copy/Empty")).toBe(true);
    expect(files.get("Scripts/Drafts/old.sd")).toBe("text of Scripts/Drafts/old.sd");
  });

  it("downloads a script as its file and a folder as a zip", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    await scripts.download(["Scripts/intro.sd"]);
    expect(downloadFile).toHaveBeenCalledWith("intro.sd", "text/plain", "text of Scripts/intro.sd");
    await scripts.download(["Scripts/Drafts"]);
    expect(fs.zipFiles).toHaveBeenCalledWith({
      files: [{ uri: uri("Scripts/Drafts/old.sd"), path: "old.sd" }],
      directories: [],
    });
    expect(downloadFile).toHaveBeenLastCalledWith("Drafts.zip", "application/zip", "zip bytes");
  });

  it("deletes a script to the recycle bin and never Main", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    await scripts.remove(["Scripts/outro.sd"]);
    expect(fs.deleteFiles).toHaveBeenCalledWith({ files: [{ uri: uri("Scripts/outro.sd") }], mode: "trash" });
    await expect(scripts.remove(["main.sd"])).rejects.toThrow("Main stays");
  });
});

describe("Scripts following File types", () => {
  it("lists a script of an ending added under File types while the page is open, and drops it when the ending goes, without a file change", async () => {
    const { scripts, fs } = fakeWorkspace([...PATHS, "Scripts/chapter.story"], FOLDERS);
    const listed = () => Object.keys(workspace.scriptListing.value?.files ?? {}).sort();
    const stop = scripts.watch();
    try {
      await vi.waitFor(() => expect(listed()).toContain("Scripts/intro.sd"));
      expect(listed()).not.toContain("Scripts/chapter.story");
      const reads = fs.getFiles.mock.calls.length;
      setScriptFiles("*.{sd,luau,story}");
      await vi.waitFor(() => expect(listed()).toContain("Scripts/chapter.story"));
      expect(fs.getFiles.mock.calls.length).toBe(reads + 1);
      setScriptFiles(SCRIPT_FILES_GLOB);
      await vi.waitFor(() => expect(listed()).not.toContain("Scripts/chapter.story"));
    } finally {
      stop();
      setScriptFiles(SCRIPT_FILES_GLOB);
    }
  });
});

describe("Scripts through the workspace, under concurrent reloads", () => {
  const switchProject = (id: string) => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id },
    };
  };

  it("follows an open editor to its new path even when a reload lands during the rename", async () => {
    const { scripts, fs, window, open } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    open.add("Scripts/intro.sd");
    const move = fs.moveFile.getMockImplementation()!;
    fs.moveFile.mockImplementation(async (projectId: string, from: string, to: string) => {
      const result = await move(projectId, from, to);
      await scripts.load();
      return result;
    });
    await scripts.rename("Scripts/intro.sd", "opening");
    expect(window.openFileEditor).toHaveBeenCalledWith("Scripts/opening.sd", "Scripts/intro.sd");
  });

  it("never lets an earlier project's pending load replace the open project's listing", async () => {
    const a = fakeWorkspace(["main.sd", "Scripts/a.sd"], ["Scripts"]);
    const b = fakeWorkspace(["main.sd", "Scripts/b.sd"], ["Scripts"]);
    let finishA!: () => void;
    const gate = new Promise<void>((resolve) => (finishA = resolve));
    const filesA = a.fs.getFiles.getMockImplementation()!;
    a.fs.getFiles.mockImplementation(async () => {
      await gate;
      return filesA();
    });
    const scripts = new WorkspaceScripts({
      fs: {
        ...b.fs,
        getFiles: (id: string) => (id === "A" ? a.fs.getFiles(id) : b.fs.getFiles(id)),
        getRelativePath: (_: string, u: string) => u.replace(/^file:\/\/\/p\//, ""),
      },
      ls: b.ls,
      window: b.window,
      autoRenameFiles: () => false,
    } as never);
    switchProject("A");
    const pendingA = scripts.load();
    switchProject("B");
    await scripts.load();
    finishA();
    await pendingA;
    expect(workspace.scriptListing.value?.projectId).toBe("B");
    expect(Object.keys(workspace.scriptListing.value!.files)).toContain("Scripts/b.sd");
  });

  it("keeps the last references read when the language server request fails, and says so", async () => {
    const { scripts, ls } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    const before = workspace.scriptReferences.value;
    expect(before).toHaveLength(1);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    ls.getScriptReferences.mockRejectedValueOnce(new Error("server not ready"));
    await scripts.load();
    expect(workspace.scriptReferences.value).toEqual(before);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("sparkdown/scriptReferences failed"),
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("answers which scripts reference an item from a fresh read, and not at all when that read fails", async () => {
    const { scripts, ls } = fakeWorkspace(PATHS, FOLDERS);
    await scripts.load();
    expect(await scripts.referencing(["Scripts/outro.sd"])).toEqual([]);
    ls.getScriptReferences.mockRejectedValueOnce(new Error("server not ready"));
    expect(await scripts.referencing(["Scripts/outro.sd"])).toBeNull();
    ls.getScriptReferences.mockResolvedValueOnce([
      { from: uri("main.sd"), to: uri("Scripts/outro.sd"), divert: true },
    ]);
    expect(await scripts.referencing(["Scripts/outro.sd"])).toEqual(["main.sd"]);
    expect(await scripts.referencing(["Scripts/intro.sd"])).toEqual(["main.sd"]);
  });
});

describe("downloading several items", () => {
  it("keeps each script's folders under the items' shared folder, so scripts with one name stay apart", async () => {
    const { scripts, fs } = fakeWorkspace(
      [...PATHS, "Scripts/A/chapter.sd", "Scripts/B/chapter.sd"],
      [...FOLDERS, "Scripts/A", "Scripts/B"],
    );
    await scripts.load();
    await scripts.download(["Scripts/A/chapter.sd", "Scripts/B/chapter.sd"]);
    expect(fs.zipFiles).toHaveBeenLastCalledWith({
      files: [
        { uri: uri("Scripts/A/chapter.sd"), path: "A/chapter.sd" },
        { uri: uri("Scripts/B/chapter.sd"), path: "B/chapter.sd" },
      ],
      directories: [],
    });
    expect(downloadFile).toHaveBeenLastCalledWith("Scripts.zip", "application/zip", "zip bytes");
    await scripts.download(["Scripts/Drafts", "Scripts/intro.sd"]);
    expect(fs.zipFiles).toHaveBeenLastCalledWith({
      files: [
        { uri: uri("Scripts/intro.sd"), path: "intro.sd" },
        { uri: uri("Scripts/Drafts/old.sd"), path: "Drafts/old.sd" },
      ],
      directories: ["Drafts"],
    });
  });

  it("keeps picked folders and their empty folders in the archive", async () => {
    const { scripts, fs } = fakeWorkspace(PATHS, [...FOLDERS, "Scripts/Drafts/Inner"]);
    await scripts.load();
    await scripts.download(["Scripts/Empty", "Scripts/intro.sd"]);
    expect(fs.zipFiles).toHaveBeenLastCalledWith({
      files: [{ uri: uri("Scripts/intro.sd"), path: "intro.sd" }],
      directories: ["Empty"],
    });
    await scripts.download(["Scripts/Drafts"]);
    expect(fs.zipFiles).toHaveBeenLastCalledWith({
      files: [{ uri: uri("Scripts/Drafts/old.sd"), path: "old.sd" }],
      directories: ["Inner"],
    });
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
