import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryLocks, memoryRoot, writeMemoryFile } from "../../../packages/opfs-workspace/test/memoryOpfs";

vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));

const services = vi.hoisted(() => ({
  fs: null as any,
  ls: null as any,
  autoRenameFiles: () => true,
  window: {
    recordScriptChange: async () => undefined,
    recordAssetChange: async () => undefined,
    openFileEditor: () => undefined,
    getActiveEditorForFile: () => undefined,
  },
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: services }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
  delete (navigator as { locks?: unknown }).locks;
});

const PROJECT = "local";
const NL = String.fromCharCode(10);
const encode = (text: string) => new TextEncoder().encode(text);

async function harness(stored: Record<string, string>) {
  vi.resetModules();
  const saved: { blob: Blob; name: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.at(-1)!.name = this.download;
  });
  const root = memoryRoot();
  for (const [path, text] of Object.entries({ ".layout": "1", ".folders": "1", ...stored })) {
    writeMemoryFile(root, `${PROJECT}/${path}`, encode(text));
  }
  Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => root } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: memoryLocks() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: (blob: Blob) => {
      saved.push({ blob, name: "" });
      return "blob:asset-stack-rename";
    },
    revokeObjectURL: () => undefined,
  }));
  const workers: { deliver(message: unknown): void }[] = [];
  class LoopbackWorker {
    listeners: ((event: { data: unknown }) => void)[] = [];
    constructor() { workers.push(this); }
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.push(listener); }
    postMessage(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => void (globalThis as any).onmessage({ data }), 0);
    }
    deliver(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => this.listeners.forEach((listener) => listener({ data })), 0);
    }
  }
  vi.stubGlobal("Worker", LoopbackWorker);
  vi.stubGlobal("BroadcastChannel", class { postMessage() {} close() {} });
  vi.stubGlobal("postMessage", (message: unknown) => workers.forEach((worker) => worker.deliver(message)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await import("../../../packages/opfs-workspace/src/opfs-workspace");
  const settings = { scriptFiles: "*.{sd,luau}", imageFiles: "*.{png,jpg}", audioFiles: "*.mp3", videoFiles: "*.mp4", fontFiles: "*.ttf" };
  await (globalThis as any).onmessage({ data: {
    jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings },
  } });
  const { SparkdownCompiler } = await import("@impower/sparkdown/src/compiler/classes/SparkdownCompiler");
  const { SparkdownDocumentRegistry } = await import("@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry");
  const { SparkdownLanguageServerWorkspace } = await import(
    "../../../packages/sparkdown-language-server/src/classes/SparkdownLanguageServerWorkspace"
  );
  const { getFileRenameEdits } = await import(
    "../../../packages/sparkdown-language-server/src/utils/providers/getFileRenameEdits"
  );
  const { default: WorkspaceFileSystem } = await import("../../src/modules/spark-editor/workspace/WorkspaceFileSystem");
  const { default: WorkspaceAssets } = await import("../../src/modules/spark-editor/workspace/WorkspaceAssets");
  const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const history = await import("../../src/modules/spark-editor/utils/undoManager");
  const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
  const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");
  setAssetFiles({ imageFiles: "*.{png,jpg}", audioFiles: "*.mp3", videoFiles: "*.mp4", fontFiles: "*.ttf" });
  history.clearUndoHistory();

  let fs: InstanceType<typeof WorkspaceFileSystem>;
  const languageServer = async () => {
    const files = Object.keys(await fs.getFiles(PROJECT));
    const scripts = files.filter((uri) => uri.endsWith(".sd"));
    const images = files.filter((uri) => /[.](png|jpg)$/.test(uri));
    const sounds = files.filter((uri) => /[.]mp3$/.test(uri));
    const texts = new Map(await Promise.all(scripts.map(async (uri) => [uri, await fs.getFileText(uri)] as const)));
    const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
    for (const [uri, text] of texts) {
      documents.add({ textDocument: { uri, languageId: "sparkdown", version: 1, text } });
    }
    const server = Object.create(SparkdownLanguageServerWorkspace.prototype);
    Object.assign(server, {
      _documents: documents,
      _watchedFiles: new Map(files.map((uri) => [uri, { uri }])),
      _programStates: new Map(),
      _documentVersions: new Map(),
      _imageFilePattern: /[.](png|jpg)$/,
      _audioFilePattern: /[.]mp3$/,
    });
    const compiler = new SparkdownCompiler();
    const leaf = (uri: string) => uri.split("/").at(-1)!;
    compiler.configure({
      files: [
        ...scripts.map((uri) => ({ uri, type: "script", name: leaf(uri).split(".")[0]!, ext: "sd", text: texts.get(uri), version: 1, languageId: "sparkdown" })),
        ...images.map((uri) => ({ uri, type: "image", name: leaf(uri).split(".")[0]!, ext: leaf(uri).split(".").at(-1)!, src: uri, version: 1 })),
        ...sounds.map((uri) => ({ uri, type: "audio", name: leaf(uri).split(".")[0]!, ext: "mp3", src: uri, version: 1 })),
      ] as never,
    });
    const main = scripts.find((uri) => uri.endsWith("/main.sd"))!;
    const program = compiler.compile({ textDocument: { uri: main } }).program;
    return { server, program };
  };
  const ls = {
    connection: { onRequest() {}, sendNotification() {} },
    start: async () => {},
    getScriptReferences: async () => [],
    getFileRenameEdits: vi.fn(async (oldUri: string, newName: string) => {
      const { server, program } = await languageServer();
      return getFileRenameEdits(server, program, oldUri, newName);
    }),
    getFileReferences: async () => [],
    getFileDiagnostics: async () => [],
    onPublishedDiagnostics: () => () => {},
  };
  fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  services.fs = fs;
  services.ls = ls;
  services.autoRenameFiles = () => true;
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: PROJECT } };
  const deps = { fs, ls, window: services.window, autoRenameFiles: () => services.autoRenameFiles() };
  const assets = new WorkspaceAssets(deps as never);
  const uri = (path: string) => fs.getFileUri(PROJECT, path);
  const read = async (path: string) => new TextDecoder().decode(await fs.readFile({ file: { uri: uri(path) } }));
  const paths = async () =>
    Object.keys(await fs.getFiles(PROJECT)).map((u) => fs.getRelativePath(PROJECT, u)).filter((p) => !p.startsWith(".")).sort();
  const write = (path: string, text: string) =>
    fs.createFiles({ files: [{ uri: uri(path), data: encode(text).buffer as ArrayBuffer }] });
  const folder = (path: string) =>
    path.split("/").reduce<any>((dir, name) => dir.entries.get(name), root.entries.get(PROJECT));
  const failCreating = (path: string, when: () => boolean = () => true) => {
    const dir = folder(path.slice(0, path.lastIndexOf("/")));
    const leafName = path.slice(path.lastIndexOf("/") + 1);
    const original = dir.getFileHandle.bind(dir);
    dir.getFileHandle = async (name: string, options: { create?: boolean } = {}) => {
      if (name === leafName && options.create && when()) {
        throw new DOMException("The storage is full", "QuotaExceededError");
      }
      return original(name, options);
    };
  };
  await assets.load();
  const failRemoving = (path: string) => {
    const dir = folder(path.slice(0, path.lastIndexOf("/")));
    const leafName = path.slice(path.lastIndexOf("/") + 1);
    const original = dir.removeEntry.bind(dir);
    dir.removeEntry = async (name: string, options?: { recursive?: boolean }) => {
      if (name === leafName) {
        throw new DOMException("Removing the original was denied", "NotAllowedError");
      }
      return original(name, options);
    };
  };
  const createdIn = (path: string) => {
    const dir = folder(path);
    const created: string[] = [];
    const original = dir.getFileHandle.bind(dir);
    dir.getFileHandle = async (name: string, options: { create?: boolean } = {}) => {
      if (options.create && !dir.entries.has(name)) created.push(name);
      return original(name, options);
    };
    return created;
  };
  const failWriting = (path: string, before: () => Promise<unknown> = async () => {}) => {
    const entry = folder(path);
    entry.createSyncAccessHandle = async () => {
      await before();
      throw new DOMException("The script could not be written", "NoModificationAllowedError");
    };
  };
  return { fs, ls, assets, history, snackbar, uri, read, write, paths, failCreating, failRemoving, failWriting, createdIn, saved };
}

const P = "Assets/Images/Portraits";
const STACK = [`${P}/imani.png`, `${P}/imani@night.png`, `${P}/imani@night~face.sad.png`, `${P}/imani~face.happy.png`];
const RENAMED = STACK.map((path) => path.replace("/imani", "/zadie"));
const SCRIPT = [
  "scene start",
  "  [[show portrait imani]]",
  "  [[show portrait imani@night]]",
  "  [[show portrait imani~face.happy]]",
  "  [[show portrait imani_extra]]",
  "end",
  "",
].join(NL);
const lines = (...text: string[]) => [...text, ""].join(NL);
const project = (extra: Record<string, string> = {}) => ({
  "main.sd": SCRIPT,
  ...Object.fromEntries(STACK.map((path, i) => [path, `picture ${i}`])),
  [`${P}/imani_extra.png`]: "extra",
  ...extra,
});
const shown = (text: string) => text.split(NL).filter((line) => line.includes("[[show")).map((line) => line.trim());
const inPortraits = async (h: Awaited<ReturnType<typeof harness>>) =>
  (await h.paths()).filter((path) => path.startsWith(`${P}/`));
const ORIGINAL = [...STACK, `${P}/imani_extra.png`].sort();

describe("renaming a stacked picture", { timeout: 120000 }, () => {
  it("renames every file of the stack, keeps their @ and ~ parts, and follows the lines that show it", async () => {
    const h = await harness(project());
    expect(await h.assets.rename(STACK[0]!, "zadie")).toBe(RENAMED[0]);
    expect(await inPortraits(h)).toEqual([`${P}/imani_extra.png`, ...RENAMED].sort());
    expect(await h.read(RENAMED[1]!)).toBe("picture 1");
    expect(await h.read(RENAMED[3]!)).toBe("picture 3");
    expect(shown(await h.read("main.sd"))).toEqual([
      "[[show portrait zadie]]",
      "[[show portrait zadie@night]]",
      "[[show portrait zadie~face.happy]]",
      "[[show portrait imani_extra]]",
    ]);
    expect(h.snackbar.value?.message).toBe("Renamed imani and 3 lines.");
  });

  it("says the same for a single picture, which leaves a reference to a longer name alone", async () => {
    const h = await harness(project());
    expect(await h.assets.rename(`${P}/imani_extra.png`, "kai")).toBe(`${P}/kai.png`);
    expect(shown(await h.read("main.sd"))).toEqual([
      "[[show portrait imani]]",
      "[[show portrait imani@night]]",
      "[[show portrait imani~face.happy]]",
      "[[show portrait kai]]",
    ]);
    expect(h.snackbar.value?.message).toBe("Renamed imani_extra and 1 line.");
    expect(await inPortraits(h)).toEqual([...STACK, `${P}/kai.png`].sort());
  });

  it("renames the files only when Auto-rename files is off", async () => {
    const h = await harness(project());
    services.autoRenameFiles = () => false;
    await h.assets.rename(STACK[0]!, "zadie");
    expect((await inPortraits(h)).filter((path) => path.includes("/zadie"))).toEqual([...RENAMED].sort());
    expect(await h.read("main.sd")).toBe(SCRIPT);
    expect(h.ls.getFileRenameEdits).not.toHaveBeenCalled();
  });

  it("undoes and redoes as one step after an unrelated edit, asking for fresh edits each time", async () => {
    const h = await harness(project({ "chapter.sd": lines("scene other", "  Unrelated.", "end") }));
    await h.assets.rename(STACK[0]!, "zadie");
    await h.write("chapter.sd", lines("scene other", "  Edited.", "end"));
    const asked = h.ls.getFileRenameEdits.mock.calls.length;
    expect(await h.history.undo()).toBe(true);
    expect(h.ls.getFileRenameEdits.mock.calls.length).toBeGreaterThan(asked);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(await h.read("main.sd")).toBe(SCRIPT);
    expect(await h.history.redo()).toBe(true);
    expect((await inPortraits(h)).filter((path) => path.includes("/zadie"))).toEqual([...RENAMED].sort());
    expect(shown(await h.read("main.sd"))[0]).toBe("[[show portrait zadie]]");
    expect(await h.read("chapter.sd")).toContain("Edited.");
  });

  it("follows a reference added after a rename that had none", async () => {
    const h = await harness(project({ "main.sd": lines("scene start", "end") }));
    await h.assets.rename(STACK[0]!, "zadie");
    expect(h.snackbar.value?.message).toBe("Renamed imani.");
    await h.write("main.sd", lines("scene start", "  [[show portrait zadie@night]]", "end"));
    expect(await h.history.undo()).toBe(true);
    expect(shown(await h.read("main.sd"))).toEqual(["[[show portrait imani@night]]"]);
    expect(await h.paths()).toContain(STACK[1]);
  });

  it("refuses an undo whose member was removed, says which, and keeps the step", async () => {
    const h = await harness(project());
    await h.assets.rename(STACK[0]!, "zadie");
    await h.fs.deleteFiles({ files: [{ uri: h.uri(RENAMED[2]!) }] });
    expect(await h.history.undo()).toBe(false);
    expect(h.snackbar.value?.message).toBe(`Couldn't rename zadie: ${RENAMED[2]} is no longer there. Nothing was renamed.`);
    expect(h.history.canUndo.value).toBe(true);
    expect((await inPortraits(h)).filter((path) => path.includes("/zadie"))).toEqual([RENAMED[0], RENAMED[1], RENAMED[3]]);
  });

  it("renames a same-name picture in another format and another folder with it, and says so", async () => {
    const h = await harness(project({
      [`${P}/imani.jpg`]: "jpg",
      "Assets/Images/Backdrops/imani.png": "backdrop",
    }));
    await h.assets.rename(STACK[0]!, "zadie");
    const after = await h.paths();
    expect(after).toContain(`${P}/zadie.jpg`);
    expect(after).toContain("Assets/Images/Backdrops/zadie.png");
    expect(after.filter((path) => /[/]imani[.@~]/.test(path))).toEqual([]);
    expect(h.snackbar.value?.message).toBe(
      "Renamed imani and 3 lines. Also renamed Assets/Images/Backdrops/imani.png, which shares its name.",
    );
    expect(await h.history.undo()).toBe(true);
    expect(await h.paths()).toContain("Assets/Images/Backdrops/imani.png");
    expect(await h.paths()).toContain(`${P}/imani.jpg`);
  });

  it("refuses a target that is taken, or two targets that collide, and changes nothing", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ [`${P}/zadie@night.png`]: "taken" }, `Couldn't rename imani: ${P}/zadie@night.png already exists. Nothing was renamed.`],
      [
        { "Assets/Images/Backdrops/imani.png": "a", "Assets/Images/Backdrops/zadie.png": "b" },
        "Couldn't rename imani: Assets/Images/Backdrops/zadie.png already exists. Nothing was renamed.",
      ],
      [
        { [`${P}/imani@NIGHT.png`]: "case" },
        `Couldn't rename imani: ${P}/imani@NIGHT.png and ${P}/imani@night.png would both become zadie@night.png. Nothing was renamed.`,
      ],
    ];
    for (const [extra, message] of cases) {
      const h = await harness(project(extra));
      const before = await h.paths();
      await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(message);
      expect(await h.paths()).toEqual(before);
      expect(await h.read("main.sd")).toBe(SCRIPT);
      expect(h.history.canUndo.value).toBe(false);
    }
  });

  it("does nothing for its own name, renames a case-only change, and refuses @ and ~", async () => {
    const h = await harness(project());
    expect(await h.assets.rename(STACK[0]!, " imani.png ")).toBe(STACK[0]);
    expect(h.history.canUndo.value).toBe(false);
    await expect(h.assets.rename(STACK[0]!, "zadie@day")).rejects.toThrow("Use a name without @ or ~.");
    await h.assets.rename(STACK[0]!, "Imani");
    expect((await inPortraits(h)).filter((path) => path.includes("/Imani"))).toEqual(
      STACK.map((path) => path.replace("/imani", "/Imani")).sort(),
    );
    expect(shown(await h.read("main.sd"))[2]).toBe("[[show portrait Imani~face.happy]]");
  });

  for (const [which, failing] of [["first", 0], ["last", 3]] as const) {
    it(`puts every file back when storage fails on the ${which} member, and records no step`, async () => {
      const h = await harness(project());
      h.failCreating(RENAMED[failing]!);
      await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(
        "Couldn't rename imani: The storage is full. Every file is back where it was.",
      );
      expect(await inPortraits(h)).toEqual(ORIGINAL);
      expect(await h.read("main.sd")).toBe(SCRIPT);
      expect(h.history.canUndo.value).toBe(false);
    });
  }

  it("asks again when a script changes between its lookups, and keeps the author's edit", async () => {
    const h = await harness(project());
    const ask = h.ls.getFileRenameEdits.getMockImplementation()!;
    let calls = 0;
    h.ls.getFileRenameEdits.mockImplementation(async (oldUri: string, newName: string) => {
      calls += 1;
      if (calls === 2) await h.write("main.sd", "An inserted line." + NL + SCRIPT);
      return ask(oldUri, newName);
    });
    await h.assets.rename(STACK[0]!, "zadie");
    const text = await h.read("main.sd");
    expect(text.startsWith("An inserted line." + NL + "scene start" + NL)).toBe(true);
    expect(shown(text)).toEqual([
      "[[show portrait zadie]]",
      "[[show portrait zadie@night]]",
      "[[show portrait zadie~face.happy]]",
      "[[show portrait imani_extra]]",
    ]);
  });

  it("refuses, renaming nothing, when a script keeps changing while the rename is prepared", async () => {
    const h = await harness(project());
    const ask = h.ls.getFileRenameEdits.getMockImplementation()!;
    let inserted = 0;
    h.ls.getFileRenameEdits.mockImplementation(async (oldUri: string, newName: string) => {
      const answer = await ask(oldUri, newName);
      inserted += 1;
      await h.write("main.sd", "Line " + inserted + "." + NL + (await h.read("main.sd")));
      return answer;
    });
    await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(
      "Couldn't rename imani: the scripts that use it kept changing while the rename was prepared. Nothing was renamed; try again.",
    );
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(shown(await h.read("main.sd"))[0]).toBe("[[show portrait imani]]");
    expect(h.history.canUndo.value).toBe(false);
  });

  it("removes a copy whose original could not be removed, and says so only once it has checked", async () => {
    const h = await harness(project());
    h.failRemoving(STACK[0]!);
    await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(
      "Couldn't rename imani: Removing the original was denied. Every file is back where it was.",
    );
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(await h.read(STACK[0]!)).toBe("picture 0");
    expect(h.history.canUndo.value).toBe(false);
  });

  it("puts back every file of a folder whose move stopped part-way", async () => {
    const h = await harness(project({ [`${P}/Cast/a.png`]: "a", [`${P}/Cast/b.png`]: "b" }));
    await h.fs.createFolder(PROJECT, "Assets/Images/Destination");
    await h.assets.load();
    h.failRemoving(`${P}/Cast/b.png`);
    await expect(h.assets.move([`${P}/Cast`, STACK[0]!], "Assets/Images/Destination")).rejects.toThrow(
      "Every file is back where it was.",
    );
    const after = await h.paths();
    expect(after).toContain(`${P}/Cast/a.png`);
    expect(after).toContain(`${P}/Cast/b.png`);
    expect(after.filter((path) => path.startsWith("Assets/Images/Destination/"))).toEqual([]);
    expect(await inPortraits(h)).toEqual([...ORIGINAL, `${P}/Cast/a.png`, `${P}/Cast/b.png`].sort());
  });

  it("refuses, renaming nothing, when a script is written just before the edit reaches storage", async () => {
    const h = await harness(project());
    const created = h.createdIn(P);
    const apply = h.fs.applyWorkspaceEdit.bind(h.fs);
    vi.spyOn(h.fs, "applyWorkspaceEdit").mockImplementation(async (...args: Parameters<typeof apply>) => {
      await h.write("main.sd", "An inserted line." + NL + SCRIPT);
      return apply(...args);
    });
    await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(
      "Couldn't rename imani: main.sd changed before the edit could be applied. Every file is back where it was.",
    );
    expect(await h.read("main.sd")).toBe("An inserted line." + NL + SCRIPT);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(created).toEqual([]);
    expect(h.history.canUndo.value).toBe(false);
  });

  it("puts back the files and every script it wrote when a script cannot be written", async () => {
    const other = lines("scene other", "  [[show portrait imani]]", "end");
    const h = await harness(project({ "zz.sd": other, "main.sd": SCRIPT.replace("scene start", "scene start" + NL + "  -> other") }));
    const main = await h.read("main.sd");
    const apply = vi.spyOn(h.fs, "applyWorkspaceEdit");
    h.failWriting("zz.sd");
    await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(
      /^Couldn't rename imani: .*The script could not be written.*\. Every file is back where it was\.$/,
    );
    expect(await h.read("main.sd")).toBe(main);
    expect(await h.read("zz.sd")).toBe(other);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(h.history.canUndo.value).toBe(false);
    expect(apply.mock.calls.map(([, label]) => label).filter((label) => label?.startsWith("Put back"))).toEqual([]);
  });

  it("leaves a script the author saved during recovery as the author saved it, and says so", async () => {
    const other = lines("scene other", "  [[show portrait imani]]", "end");
    const h = await harness(project({ "zz.sd": other, "main.sd": SCRIPT.replace("scene start", "scene start" + NL + "  -> other") }));
    const saved = (await h.read("main.sd")).replace("[[show portrait imani]]", "[[show portrait zadie]]") + "The author's saved line." + NL;
    h.failWriting("zz.sd", async () =>
      h.write("main.sd", (await h.read("main.sd")) + "The author's saved line." + NL),
    );
    await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toMatchObject({
      rollback: { complete: false, kept: ["main.sd"] },
    });
    expect(await h.read("main.sd")).toBe(saved.replace(/imani(@night|~face)/g, "zadie$1"));
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("does not rename narration that took a reference's place between lookups", async () => {
    const h = await harness(project());
    const ask = h.ls.getFileRenameEdits.getMockImplementation()!;
    let calls = 0;
    h.ls.getFileRenameEdits.mockImplementation(async (oldUri: string, newName: string) => {
      const answer = await ask(oldUri, newName);
      calls += 1;
      if (calls === 1) await h.write("main.sd", SCRIPT.replace("  [[show portrait imani]]", "  The author says imani."));
      return answer;
    });
    await h.assets.rename(STACK[0]!, "zadie");
    const text = await h.read("main.sd");
    expect(text).toContain("  The author says imani.");
    expect(shown(text)).toEqual([
      "[[show portrait zadie@night]]",
      "[[show portrait zadie~face.happy]]",
      "[[show portrait imani_extra]]",
    ]);
  });

  it("guards a single picture's rename the same way, and puts it back whole when a script cannot be written", async () => {
    const single = { [`${P}/kai.png`]: "kai" };
    const other = lines("scene other", "  [[show portrait kai]]", "end");
    const h = await harness({ ...single, "main.sd": lines("scene start", "  -> other", "  [[show portrait kai]]", "end"), "zz.sd": other });
    const ask = h.ls.getFileRenameEdits.getMockImplementation()!;
    let calls = 0;
    h.ls.getFileRenameEdits.mockImplementation(async (oldUri: string, newName: string) => {
      const answer = await ask(oldUri, newName);
      calls += 1;
      if (calls === 1) await h.write("main.sd", "An inserted line." + NL + (await h.read("main.sd")));
      return answer;
    });
    h.failWriting("zz.sd");
    expect(await h.assets.rename(`${P}/kai.png`, "rafe")).toBe(`${P}/kai.png`);
    expect(await h.read("main.sd")).toBe("An inserted line." + NL + lines("scene start", "  -> other", "  [[show portrait kai]]", "end"));
    expect(await h.read("zz.sd")).toBe(other);
    expect(await h.paths()).toEqual([`${P}/kai.png`, "main.sd", "zz.sd"]);
    expect(h.history.canUndo.value).toBe(false);
  });

  it("keeps a same-name picture in another folder whole, alternates and all, through the rename and its Undo", async () => {
    const script = lines("scene start", "  [[show portrait imani]]", "  [[show backdrop imani@day]]", "end");
    const h = await harness({
      "main.sd": script,
      [`${P}/imani.png`]: "portrait",
      "Assets/Images/Backdrops/imani.png": "backdrop",
      "Assets/Images/Backdrops/imani@day.png": "day",
    });
    expect(await h.assets.rename(`${P}/imani.png`, "zadie")).toBe(`${P}/zadie.png`);
    expect(await h.paths()).toEqual([
      "Assets/Images/Backdrops/zadie.png",
      "Assets/Images/Backdrops/zadie@day.png",
      `${P}/zadie.png`,
      "main.sd",
    ]);
    expect(shown(await h.read("main.sd"))).toEqual(["[[show portrait zadie]]", "[[show backdrop zadie@day]]"]);
    expect(h.snackbar.value?.message).toBe(
      "Renamed imani and 2 lines. Also renamed Assets/Images/Backdrops/imani.png, Assets/Images/Backdrops/imani@day.png, which share its name.",
    );
    expect(await h.history.undo()).toBe(true);
    expect(await h.paths()).toEqual([
      "Assets/Images/Backdrops/imani.png",
      "Assets/Images/Backdrops/imani@day.png",
      `${P}/imani.png`,
      "main.sd",
    ]);
    expect(await h.read("main.sd")).toBe(script);
  });

  it("refuses to split a same-name picture outside the asset folders, renaming nothing", async () => {
    const h = await harness(project({ "art/imani.png": "art", "art/imani@x.png": "x" }));
    await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(
      "Couldn't rename imani: art/imani.png shares its name but belongs to a picture with more files (art/imani@x.png); rename that picture from its own folder. Nothing was renamed.",
    );
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(await h.paths()).toContain("art/imani@x.png");
    expect(await h.read("main.sd")).toBe(SCRIPT);
  });

  it("renames a sound and its same-name sound elsewhere without taking other sounds for a picture's alternates", async () => {
    const h = await harness({
      "main.sd": lines("scene start", "end"),
      "Assets/Audio/theme@v2.mp3": "a",
      "other/theme@v2.mp3": "b",
      "other/theme@v3.mp3": "c",
    });
    expect(await h.assets.rename("Assets/Audio/theme@v2.mp3", "song")).toBe("Assets/Audio/song.mp3");
    expect(await h.paths()).toEqual(["Assets/Audio/song.mp3", "main.sd", "other/song.mp3", "other/theme@v3.mp3"]);
  });

  it("renames a same-name picture outside the asset folders whose neighbour only looks like an alternate", async () => {
    const h = await harness(project({ "art/imani.png": "art", "art/imani@notes.txt": "notes" }));
    await h.assets.rename(STACK[0]!, "zadie");
    const after = await h.paths();
    expect(after).toContain("art/zadie.png");
    expect(after).toContain("art/imani@notes.txt");
    expect((await inPortraits(h)).filter((path) => path.includes("/zadie"))).toEqual([...RENAMED].sort());
  });

  it("gives a dotted picture the name typed even when a same-name picture elsewhere is renamed with it", async () => {
    const h = await harness({
      "main.sd": lines("scene start", "  [[show portrait kai]]", "end"),
      [`${P}/kai.v1.png`]: "kai",
      "Assets/Images/Backdrops/kai.png": "backdrop",
    });
    expect(await h.assets.rename(`${P}/kai.v1.png`, "rafe")).toBe(`${P}/rafe.png`);
    expect(await h.paths()).toEqual(["Assets/Images/Backdrops/rafe.png", `${P}/rafe.png`, "main.sd"]);
    expect(shown(await h.read("main.sd"))).toEqual(["[[show portrait rafe]]"]);
  });

  it("refuses a stack target that differs from an existing file only by case, with Auto-rename files off", async () => {
    const h = await harness(project({ [`${P}/ZADIE@night.png`]: "other" }));
    services.autoRenameFiles = () => false;
    await expect(h.assets.rename(STACK[0]!, "zadie")).rejects.toThrow(
      `Assets/Images/Portraits/ZADIE@night.png already exists. Nothing was moved.`,
    );
    expect(await inPortraits(h)).toEqual([...ORIGINAL, `${P}/ZADIE@night.png`].sort());
  });

  it("refuses a dotted name for a stacked picture, so every rename it accepts can be undone", async () => {
    const h = await harness(project());
    await expect(h.assets.rename(STACK[0]!, "zadie.v2")).rejects.toThrow(
      "Use a name without a dot for a picture with alternates or layers.",
    );
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(await h.read("main.sd")).toBe(SCRIPT);
    expect(h.history.canUndo.value).toBe(false);
    await h.assets.rename(STACK[0]!, "zadie");
    expect(await h.history.undo()).toBe(true);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("renames a lone alternate or layer as the thing it is, keeping its @ or ~ part", async () => {
    const h = await harness({
      "main.sd": lines("scene start", "  [[show portrait imani]]", "end"),
      [`${P}/imani@night.png`]: "night",
      "Assets/Images/Backdrops/harbor~sky.clear.png": "sky",
    });
    expect(await h.assets.rename(`${P}/imani@night.png`, "zadie")).toBe(`${P}/zadie@night.png`);
    expect(await h.assets.rename("Assets/Images/Backdrops/harbor~sky.clear.png", "dock")).toBe(
      "Assets/Images/Backdrops/dock~sky.clear.png",
    );
    expect(await h.paths()).toEqual(["Assets/Images/Backdrops/dock~sky.clear.png", `${P}/zadie@night.png`, "main.sd"]);
  });

  it("renames a sound whose name has an at sign as a single file", async () => {
    const h = await harness({ "main.sd": lines("scene start", "end"), "Assets/Audio/theme@v2.mp3": "audio" });
    expect(await h.assets.rename("Assets/Audio/theme@v2.mp3", "song")).toBe("Assets/Audio/song.mp3");
  });

  it("puts back a folder whose inline rename stopped part-way, and says so under the field", async () => {
    const h = await harness(project({ [`${P}/Cast/a.png`]: "a", [`${P}/Cast/b.png`]: "b" }));
    h.failRemoving(`${P}/Cast/b.png`);
    await expect(h.assets.rename(`${P}/Cast`, "Actors")).rejects.toThrow(
      "Couldn't move Cast: Removing the original was denied. Every file is back where it was.",
    );
    const after = await h.paths();
    expect(after.filter((path) => path.startsWith(`${P}/Actors`))).toEqual([]);
    expect(await h.read(`${P}/Cast/a.png`)).toBe("a");
    expect(await h.read(`${P}/Cast/b.png`)).toBe("b");
    expect(h.history.canUndo.value).toBe(false);
  });

  it("downloads a folder as a zip of the folder, with its empty folders, even when it holds one file", async () => {
    const h = await harness(project({ [`${P}/Cast/kai.png`]: "kai" }));
    await h.fs.createFolder(PROJECT, `${P}/Cast/Empty`);
    await h.assets.load();
    await h.assets.downloadAll([`${P}/Cast`]);
    const [zip] = h.saved;
    expect(zip!.name).toBe("Cast.zip");
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(zip!.blob);
    });
    const names: string[] = [];
    for (let i = 0; i + 46 < bytes.length; i++) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2) {
        const length = bytes[i + 28]! | (bytes[i + 29]! << 8);
        names.push(new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + length)));
      }
    }
    expect(names.map((name) => name.replace(/[/]$/, "")).sort()).toEqual(["Cast", "Cast/Empty", "Cast/kai.png"]);
  });

  it("puts back a single folder whose move stopped part-way", async () => {
    const h = await harness(project({ [`${P}/Cast/a.png`]: "a", [`${P}/Cast/b.png`]: "b" }));
    await h.fs.createFolder(PROJECT, "Assets/Images/Destination");
    await h.assets.load();
    h.failRemoving(`${P}/Cast/b.png`);
    await expect(h.assets.move([`${P}/Cast`], "Assets/Images/Destination")).rejects.toThrow(
      "Couldn't move Cast: Removing the original was denied. Every file is back where it was.",
    );
    const after = await h.paths();
    expect(after.filter((path) => path.startsWith("Assets/Images/Destination/"))).toEqual([]);
    expect(await h.read(`${P}/Cast/a.png`)).toBe("a");
    expect(await h.read(`${P}/Cast/b.png`)).toBe("b");
    expect(await h.fs.getFolders(PROJECT)).not.toContain("Assets/Images/Destination/Cast");
  });

  it("puts an empty folder back when a move stops part-way", async () => {
    const h = await harness(project());
    await h.fs.createFolder(PROJECT, `${P}/AEmpty`);
    await h.fs.createFolder(PROJECT, "Assets/Images/Destination");
    await h.assets.load();
    h.failRemoving(STACK[0]!);
    await expect(h.assets.move([`${P}/AEmpty`, STACK[0]!], "Assets/Images/Destination")).rejects.toThrow(
      "Every file is back where it was.",
    );
    const folders = await h.fs.getFolders(PROJECT);
    expect(folders).toContain(`${P}/AEmpty`);
    expect(folders).not.toContain("Assets/Images/Destination/AEmpty");
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("renames a picture whose name has a dot to the name typed, and undoes it", async () => {
    const h = await harness({ "main.sd": lines("scene start", "  [[show portrait kai]]", "end"), [`${P}/kai.v1.png`]: "kai" });
    expect(await h.assets.rename(`${P}/kai.v1.png`, "rafe")).toBe(`${P}/rafe.png`);
    expect(await h.paths()).toEqual([`${P}/rafe.png`, "main.sd"]);
    expect(shown(await h.read("main.sd"))).toEqual(["[[show portrait rafe]]"]);
    expect(await h.history.undo()).toBe(true);
    expect(await h.paths()).toEqual([`${P}/kai.v1.png`, "main.sd"]);
    expect(shown(await h.read("main.sd"))).toEqual(["[[show portrait kai]]"]);
  });

  it("names the file it could not put back after a failure", async () => {
    const h = await harness(project());
    let failed = false;
    h.failCreating(RENAMED[3]!, () => (failed = true));
    h.failCreating(STACK[1]!, () => failed);
    const failure = h.assets.rename(STACK[0]!, "zadie");
    await expect(failure).rejects.toThrow(/^Couldn't rename imani: The storage is full; the edit was partly applied: /);
    await expect(failure).rejects.toThrow(
      `Not put back: ${RENAMED[1]} (was ${STACK[1]}; putting it back failed: The storage is full).`,
    );
    expect(await h.paths()).toContain(RENAMED[1]);
    expect(h.history.canUndo.value).toBe(false);
  });
});

describe("moving and deleting a stacked picture", { timeout: 120000 }, () => {
  it("moves every file of the stack as one step, leaves the lines alone, and undoes it", async () => {
    const h = await harness(project());
    await h.fs.createFolder(PROJECT, "Assets/Images/Cast");
    await h.assets.load();
    const moved = await h.assets.move([STACK[0]!], "Assets/Images/Cast");
    expect(moved.map((move) => move.to)).toEqual(STACK.map((path) => path.replace(P, "Assets/Images/Cast")));
    expect(await inPortraits(h)).toEqual([`${P}/imani_extra.png`]);
    expect(await h.read("main.sd")).toBe(SCRIPT);
    expect(await h.history.undo()).toBe(true);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("downloads a stacked picture as one zip named for it, holding every file", async () => {
    const h = await harness(project());
    await h.assets.downloadAll([STACK[0]!]);
    const [zip] = h.saved;
    expect(zip!.name).toBe("imani.zip");
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(zip!.blob);
    });
    const names: string[] = [];
    for (let i = 0; i + 46 < bytes.length; i++) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2) {
        const length = bytes[i + 28]! | (bytes[i + 29]! << 8);
        names.push(new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + length)));
      }
    }
    expect(names.sort()).toEqual(STACK.map((path) => path.slice(P.length + 1)).sort());
    await h.assets.downloadAll([`${P}/imani_extra.png`]);
    expect(h.saved.at(-1)!.name).toBe("imani_extra.png");
  });

  it("refuses a move onto a name the folder already has", async () => {
    const h = await harness(project({ "Assets/Images/Cast/imani@night.png": "other" }));
    await expect(h.assets.move([STACK[0]!], "Assets/Images/Cast")).rejects.toThrow("Cast already has imani@night.png.");
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("deletes every file of the stack to the bin, and Undo restores them all to their folder", async () => {
    const h = await harness(project());
    await h.assets.remove([STACK[0]!]);
    expect(await inPortraits(h)).toEqual([`${P}/imani_extra.png`]);
    expect(h.snackbar.value?.message).toBe("Deleted imani");
    const [batch] = await h.fs.listTrash(PROJECT);
    expect(batch!.entries.map((entry) => entry.relPath).sort()).toEqual([...STACK].sort());
    expect(await h.history.undo()).toBe(true);
    await vi.waitFor(async () => expect(await inPortraits(h)).toEqual(ORIGINAL));
    expect(await h.read(STACK[2]!)).toBe("picture 2");
  });
});

const MIA = `${P}/mia`;
const FOLDER_STACK = [`${MIA}/10_hat.on.png`, `${MIA}/30_face.happy.png`, `${MIA}/30_face.neutral~default.png`, `${MIA}/90_body.png`];
const withFolderStack = (extra: Record<string, string> = {}) =>
  project({ ...Object.fromEntries(FOLDER_STACK.map((path, i) => [path, `layer ${i}`])), ...extra });
const inMia = async (h: Awaited<ReturnType<typeof harness>>) =>
  (await h.paths()).filter((path) => path.startsWith(`${MIA}/`));

describe("a stack's own files", { timeout: 120000 }, () => {
  it("renames one layer's option part, leaving the other files and the picture's name alone", async () => {
    const h = await harness(project());
    expect(await h.assets.renameMember(STACK[3]!, "imani~face.glad")).toBe(`${P}/imani~face.glad.png`);
    expect(await inPortraits(h)).toEqual(
      [...STACK.filter((path) => path !== STACK[3]), `${P}/imani~face.glad.png`, `${P}/imani_extra.png`].sort(),
    );
    expect(await h.read(`${P}/imani~face.glad.png`)).toBe("picture 3");
    expect(h.snackbar.value?.message).toBe("Renamed imani~face.happy.png.");
    expect(await h.history.undo()).toBe(true);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("renames only the one layer when another layer shares its name up to the first dot", async () => {
    const h = await harness(project({ [`${P}/imani~face.sad.png`]: "sad", [`${P}/imani~face.happy.webp`]: "webp" }));
    await h.assets.renameMember(STACK[3]!, "imani~face.glad");
    expect((await inPortraits(h)).filter((path) => path.includes("~face."))).toEqual(
      [`${P}/imani@night~face.sad.png`, `${P}/imani~face.glad.png`, `${P}/imani~face.happy.webp`, `${P}/imani~face.sad.png`].sort(),
    );
    expect(await h.read(`${P}/imani~face.sad.png`)).toBe("sad");
  });

  it("renames a layer's group beside another option of that group, leaving the scripts alone", async () => {
    const h = await harness(project({ [`${P}/imani~face.sad.png`]: "sad" }));
    expect(await h.assets.renameMember(STACK[3]!, "imani~mood.happy")).toBe(`${P}/imani~mood.happy.png`);
    expect(await h.read(`${P}/imani~face.sad.png`)).toBe("sad");
    expect(await h.read("main.sd")).toBe(SCRIPT);
  });

  it("refuses a rename that changes the picture the file belongs to, in WorkspaceAssets' words", async () => {
    const h = await harness(project());
    await expect(h.assets.renameMember(STACK[3]!, "zadie~face.happy")).rejects.toThrow(
      "Keep imani before the @ or ~. That part names the picture the file belongs to; rename the picture to change it.",
    );
    await expect(h.assets.renameMember(STACK[1]!, "imani.v2@night")).rejects.toThrow(
      "Use a name without a dot for a picture with alternates or layers. Scripts name a picture by the part before its first dot.",
    );
    await expect(h.assets.renameMember(STACK[1]!, "imani@night~face.sad")).rejects.toThrow(
      "That name is already in use in this folder.",
    );
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("renames an alternate with its own layer files, leaving the other pictures' files alone (#2186)", async () => {
    const h = await harness(project());
    expect(await h.assets.renameMember(STACK[1]!, "imani@dark")).toBe(`${P}/imani@dark.png`);
    expect(await inPortraits(h)).toEqual(
      [STACK[0]!, `${P}/imani@dark.png`, `${P}/imani@dark~face.sad.png`, STACK[3]!, `${P}/imani_extra.png`].sort(),
    );
    expect(await h.read("main.sd")).toBe(SCRIPT.replace("imani@night", "imani@dark"));
    expect(await h.history.undo()).toBe(true);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
  });

  it("keeps an alternate's layer files with it when the new alternate name holds a dot (#2186)", async () => {
    const h = await harness(project());
    expect(await h.assets.renameMember(STACK[1]!, "imani@dark.v2")).toBe(`${P}/imani@dark.v2.png`);
    expect(await inPortraits(h)).toEqual(
      [STACK[0]!, `${P}/imani@dark.v2.png`, `${P}/imani@dark.v2~face.sad.png`, STACK[3]!, `${P}/imani_extra.png`].sort(),
    );
    const { imageStacks } = await import("../../src/modules/spark-editor/utils/imageStacks");
    const [stack] = imageStacks(STACK.map((path) => path.replace("imani@night", "imani@dark.v2")));
    expect(stack!.pictures.find((picture) => picture.alternate === "dark.v2")?.layers).toEqual([`${P}/imani@dark.v2~face.sad.png`]);
  });

  it("leaves a script the author saved during a failed alternate rename as saved, puts the file back, and says so from the rollback", async () => {
    const other = lines("scene other", "  [[show portrait imani@night]]", "end");
    const h = await harness(project({ "zz.sd": other, "main.sd": SCRIPT.replace("scene start", "scene start" + NL + "  -> other") }));
    const saved = (await h.read("main.sd")) + "The author's saved line." + NL;
    h.failWriting("zz.sd", async () => h.write("main.sd", saved));
    const failure = h.assets.renameMember(STACK[1]!, "imani@dark");
    await expect(failure).rejects.toMatchObject({ rollback: { complete: false, kept: ["main.sd"] } });
    await expect(failure).rejects.toThrow(/^Couldn't rename imani@night\.png, and these files may be left changed: .*main\.sd/);
    expect(await h.read("main.sd")).toBe(saved);
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(h.history.canUndo.value).toBe(false);
  });

  it("leaves a script the author saved during a failed Undo of an alternate rename as saved", async () => {
    const other = lines("scene other", "  [[show portrait imani@night]]", "end");
    const h = await harness(project({ "zz.sd": other, "main.sd": SCRIPT.replace("scene start", "scene start" + NL + "  -> other") }));
    expect(await h.assets.renameMember(STACK[1]!, "imani@dark")).toBe(`${P}/imani@dark.png`);
    const saved = (await h.read("main.sd")) + "The author's saved line." + NL;
    h.failWriting("zz.sd", async () => h.write("main.sd", saved));
    expect(await h.history.undo()).toBe(false);
    expect(await h.read("main.sd")).toBe(saved);
    expect(await inPortraits(h)).toEqual(expect.arrayContaining([`${P}/imani@dark.png`, `${P}/imani@dark~face.sad.png`]));
    expect(h.snackbar.value?.message).toMatch(/^Couldn't rename imani: .*imani@night~face\.sad\.png.*main\.sd/);
  });

  it("deletes one file to the bin and keeps the rest of the picture", async () => {
    const h = await harness(project());
    await h.assets.removeMember(STACK[2]!);
    expect(await inPortraits(h)).toEqual(ORIGINAL.filter((path) => path !== STACK[2]));
    expect(h.snackbar.value?.message).toBe("Deleted imani@night~face.sad.png");
    const [batch] = await h.fs.listTrash(PROJECT);
    expect(batch!.entries.map((entry) => entry.relPath)).toEqual([STACK[2]]);
  });

  it("says when storage refuses to move one file to the bin, and keeps it and the rest", async () => {
    const h = await harness(project());
    h.failRemoving(STACK[2]!);
    await expect(h.assets.removeMember(STACK[2]!)).rejects.toThrow(
      "Couldn't move imani@night~face.sad.png to the bin. It is still where it was.",
    );
    expect(await inPortraits(h)).toEqual(ORIGINAL);
    expect(await h.read(STACK[2]!)).toBe("picture 2");
    expect(h.history.canUndo.value).toBe(false);
  });

  it("keeps the @ and ~ of a layer and an alternate file uploaded from the page", async () => {
    const h = await harness(project());
    const file = (name: string) => ({ name, getBuffer: async () => encode(name).buffer as ArrayBuffer });
    await h.assets.upload([file("imani~hat.on.png"), file("imani@dusk.png")], P);
    expect(await inPortraits(h)).toEqual(expect.arrayContaining([`${P}/imani~hat.on.png`, `${P}/imani@dusk.png`]));
    expect(await h.read(`${P}/imani@dusk.png`)).toBe("imani@dusk.png");
  });

  it("adds a layer or alternate beside the base, not in the Add menu's folder", async () => {
    const h = await harness(project());
    await h.assets.addBeside([{ name: "imani~hat.on.png", getBuffer: async () => encode("hat").buffer as ArrayBuffer }], STACK[0]!);
    expect(await inPortraits(h)).toContain(`${P}/imani~hat.on.png`);
    expect(await h.read(`${P}/imani~hat.on.png`)).toBe("hat");
  });
});

describe("a folder stack", { timeout: 120000 }, () => {
  it("keeps the thing's Rename and Move to its folder, and says why", async () => {
    const h = await harness(withFolderStack());
    const reason = "mia is made of the numbered files in its folder. Rename or move the folder mia instead.";
    await expect(h.assets.rename(FOLDER_STACK[0]!, "zadie")).rejects.toThrow(reason);
    await h.fs.createFolder(PROJECT, "Assets/Images/Cast");
    await h.assets.load();
    await expect(h.assets.move([FOLDER_STACK[0]!], "Assets/Images/Cast")).rejects.toThrow(reason);
    expect(await inMia(h)).toEqual(FOLDER_STACK);
  });

  it("renames a layer's name after its number, and refuses one that drops the number", async () => {
    const h = await harness(withFolderStack());
    expect(await h.assets.renameMember(FOLDER_STACK[1]!, "30_face.glad")).toBe(`${MIA}/30_face.glad.png`);
    await expect(h.assets.renameMember(FOLDER_STACK[0]!, "hat.on")).rejects.toThrow(
      "Keep the number and underscore at the start, as in 10_face.happy. They place the file among mia's layers.",
    );
    expect(await inMia(h)).toEqual([FOLDER_STACK[0], `${MIA}/30_face.glad.png`, FOLDER_STACK[2], FOLDER_STACK[3]].sort());
  });

  it("renames a layer's group without taking the group's other options along, and undoes it", async () => {
    const h = await harness(withFolderStack());
    expect(await h.assets.renameMember(FOLDER_STACK[1]!, "30_eyes.happy")).toBe(`${MIA}/30_eyes.happy.png`);
    expect(await inMia(h)).toEqual([FOLDER_STACK[0], `${MIA}/30_eyes.happy.png`, FOLDER_STACK[2], FOLDER_STACK[3]].sort());
    expect(await h.history.undo()).toBe(true);
    expect(await inMia(h)).toEqual(FOLDER_STACK);
  });

  it("deletes every layer to the bin under the thing's name, and Undo restores them", async () => {
    const h = await harness(withFolderStack());
    await h.assets.remove([FOLDER_STACK[2]!]);
    expect(await inMia(h)).toEqual([]);
    expect(h.snackbar.value?.message).toBe("Deleted mia");
    const [batch] = await h.fs.listTrash(PROJECT);
    expect(batch!.entries.map((entry) => entry.relPath).sort()).toEqual(FOLDER_STACK);
    expect(await h.history.undo()).toBe(true);
    await vi.waitFor(async () => expect(await inMia(h)).toEqual(FOLDER_STACK));
  });

  it("restores every layer from the bin", async () => {
    const h = await harness(withFolderStack());
    await h.assets.remove([FOLDER_STACK[0]!]);
    const [batch] = await h.fs.listTrash(PROJECT);
    await h.fs.restoreTrash(PROJECT, batch!.batchId);
    await vi.waitFor(async () => expect(await inMia(h)).toEqual(FOLDER_STACK));
  });

  it("downloads every layer as one zip named for the thing", async () => {
    const h = await harness(withFolderStack());
    await h.assets.downloadAll([FOLDER_STACK[0]!]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.saved.at(-1)!.name).toBe("mia.zip");
  });
});
