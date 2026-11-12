import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode-jsonrpc/browser", () => ({
  BrowserMessageReader: class {},
  BrowserMessageWriter: class {},
  createMessageConnection: vi.fn(),
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceAssets } = await import("../../src/modules/spark-editor/workspace/WorkspaceAssets");
const { default: WorkspaceLanguageServer } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceLanguageServer"
);
const { assetLevel, assetSearch } = await import("../../src/modules/spark-editor/workspace/assetsListing");
const { assetEndings, setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { rowLine } = await import("../../src/modules/spark-editor/utils/fileListModel");
const { usesLabel } = await import("../../src/modules/spark-editor/workspace/assetUsage");
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");

const PROJECT = "project";
const ROOT = `file:///${PROJECT}/`;
const uri = (path: string) => `${ROOT}${path}`;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const IMAGES = "Assets/Images";
const FILES = [
  `${IMAGES}/harbor.png`,
  `${IMAGES}/harbor@night.png`,
  `${IMAGES}/imani.png`,
  `${IMAGES}/market.png`,
  `${IMAGES}/unused.png`,
];

type Use = { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; role: "backdrop" | "portrait"; text: string };

const use = (script: string, line: number, role: Use["role"] = "backdrop"): Use => ({
  uri: uri(script),
  range: { start: { line, character: 2 }, end: { line, character: 9 } },
  role,
  text: `  line ${line} of ${script}`,
});

const SCRIPTS = [
  { from: uri("main.sd"), to: uri("Scripts/chapter.sd"), divert: true },
  { from: uri("Scripts/chapter.sd"), to: uri("Scripts/ending.sd"), divert: true },
];

const answer = (uses: Record<string, Use[]>, version = 1) => ({
  version,
  uses: Object.fromEntries(FILES.map((path) => [uri(path), uses[path] ?? []])),
  scripts: SCRIPTS,
});

const FULL = answer({
  [`${IMAGES}/harbor.png`]: [use("main.sd", 1), use("Scripts/chapter.sd", 4)],
  [`${IMAGES}/harbor@night.png`]: [use("Scripts/ending.sd", 9)],
  [`${IMAGES}/imani.png`]: [use("Scripts/chapter.sd", 2, "portrait"), use("Scripts/ending.sd", 3, "portrait")],
  [`${IMAGES}/market.png`]: [use("Scripts/ending.sd", 20)],
});

function fakeWorkspace() {
  const fs = {
    getFiles: vi.fn(async () =>
      Object.fromEntries(FILES.map((path) => [uri(path), { uri: uri(path), size: 10, modified: 1, src: `/src/${path}` }])),
    ),
    getFolders: vi.fn(async () => [IMAGES]),
    getFileUri: (_: string, path: string) => uri(path),
    getRelativePath: (_: string, u: string) => u.slice(ROOT.length),
    getFileText: vi.fn(async () => ""),
  };
  const ls = {
    getAssetUsage: vi.fn(async (_uri: string): Promise<ReturnType<typeof answer> | null> => FULL),
    getFileDiagnostics: vi.fn(async () => []),
    onPublishedDiagnostics: () => () => {},
    getVariantPicture: vi.fn(async () => null),
  };
  const window = { recordScriptChange: vi.fn(), recordAssetChange: vi.fn() };
  const assets = new WorkspaceAssets({ fs, ls, window, autoRenameFiles: () => true } as never);
  return { assets, fs, ls };
}

const compiled = async () => {
  sendProtocolMessage(CompiledProgramMessage.type.notification({ program: {} } as never));
  await settle();
};

const rows = (sort: string) =>
  assetLevel({
    listing: workspace.assetListing.value!,
    type: "image",
    sort,
    endings: assetEndings.peek(),
    usage: workspace.assetUsage.value,
  }).rows;

const lines = (sort: string) =>
  rows(sort).map((row) => `${row.name}: ${rowLine({ entry: row, sort, usesLabel: workspace.assetUsage.value ? usesLabel : undefined })}`);

beforeEach(() => {
  vi.clearAllMocks();
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: PROJECT } };
  workspace.assetListing.value = null;
  workspace.assetUsage.value = null;
  workspace.assetUsageFailed.value = null;
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
});

describe("asset usage, asked once for the whole project (#1033)", () => {
  it("sends one sparkdown/fileReferencesAll request for the project's main script", async () => {
    const client = Object.create(WorkspaceLanguageServer.prototype) as InstanceType<typeof WorkspaceLanguageServer>;
    const sendRequest = vi.fn().mockResolvedValue(FULL);
    Object.assign(client, { _connection: { sendRequest }, initialization: vi.fn().mockResolvedValue(undefined) });
    expect(await client.getAssetUsage(uri("main.sd"))).toBe(FULL);
    expect(sendRequest.mock.calls).toEqual([["sparkdown/fileReferencesAll", { uri: uri("main.sd") }]]);
  });

  it("asks once when the page watches, for every file at once, and keys the answer by path", async () => {
    const { assets, ls } = fakeWorkspace();
    await assets.load();
    const dispose = assets.watch();
    await settle();
    expect(ls.getAssetUsage.mock.calls).toEqual([[uri("main.sd")]]);
    expect(Object.keys(workspace.assetUsage.value!.uses).sort()).toEqual([...FILES].sort());
    expect(workspace.assetUsage.value!.uses[`${IMAGES}/imani.png`]!.map((u) => u.path)).toEqual([
      "Scripts/chapter.sd",
      "Scripts/ending.sd",
    ]);
    dispose();
  });

  it("counts a stack's uses as the union of its files' uses, and says unused for none", async () => {
    const { assets } = fakeWorkspace();
    await assets.load();
    await assets.loadUsage();
    expect(lines("uses-desc")).toEqual(["harbor: 3 uses", "imani: 2 uses", "market: 1 use", "unused: unused"]);
  });

  it("counts a line that names a thing twice as one use, on the row and in the delete check", async () => {
    const { assets, ls } = fakeWorkspace();
    const twice = (line: number, character: number) => ({ ...use("main.sd", line), range: { start: { line, character }, end: { line, character: character + 6 } } });
    ls.getAssetUsage.mockResolvedValue(answer({ [`${IMAGES}/market.png`]: [twice(2, 4), twice(2, 20), twice(5, 4)] }));
    await assets.load();
    await assets.loadUsage();
    expect(rows("uses-desc").find((row) => row.name === "market")!.uses).toBe(2);
    const groups = (await assets.usedBy([`${IMAGES}/market.png`]))!;
    expect(groups.flatMap((group) => group.uses.map((u) => u.range.start.line))).toEqual([2, 5]);
  });

  it("lists every unused thing first under Uses ascending", async () => {
    const { assets } = fakeWorkspace();
    await assets.load();
    await assets.loadUsage();
    expect(rows("uses-asc").map((row) => row.name)).toEqual(["unused", "market", "imani", "harbor"]);
  });

  it("sorts in Story order by the first line that reaches each thing, Main then its includes, unreached last", async () => {
    const { assets } = fakeWorkspace();
    await assets.load();
    await assets.loadUsage();
    expect(rows("story-asc").map((row) => row.name)).toEqual(["harbor", "imani", "market", "unused"]);
    expect(rows("story-desc").map((row) => row.name)).toEqual(["market", "imani", "harbor", "unused"]);
  });

  it("treats a use in a script the story never reaches as unreached", async () => {
    const { assets, ls } = fakeWorkspace();
    ls.getAssetUsage.mockResolvedValue(
      answer({ [`${IMAGES}/market.png`]: [use("Scripts/loose.sd", 0)], [`${IMAGES}/imani.png`]: [use("main.sd", 5)] }),
    );
    await assets.load();
    await assets.loadUsage();
    expect(rows("story-asc").map((row) => row.name)).toEqual(["imani", "harbor", "market", "unused"]);
  });

  it("sorts Uses and Story order as Name, with the modified line, until the server has answered", async () => {
    const { assets } = fakeWorkspace();
    await assets.load();
    expect(rows("uses-asc").map((row) => row.name)).toEqual(["harbor", "imani", "market", "unused"]);
    expect(rows("story-asc").map((row) => row.name)).toEqual(["harbor", "imani", "market", "unused"]);
    expect(lines("uses-asc")[0]).toMatch(/^harbor: Modified .* · 20 B$/);
  });

  it("asks again when the program compiles, moving a thing out of the unused group without a reload", async () => {
    const { assets, ls } = fakeWorkspace();
    await assets.load();
    const dispose = assets.watch();
    await settle();
    expect(rows("uses-asc")[0]!.name).toBe("unused");
    ls.getAssetUsage.mockResolvedValue(
      answer({ ...Object.fromEntries(Object.entries(FULL.uses).map(([u, l]) => [u.slice(ROOT.length), l])), [`${IMAGES}/unused.png`]: [use("main.sd", 7), use("main.sd", 8)] }, 2),
    );
    await compiled();
    expect(ls.getAssetUsage).toHaveBeenCalledTimes(2);
    expect(rows("uses-asc").map((row) => row.name)).toEqual(["market", "imani", "unused", "harbor"]);
    dispose();
    await compiled();
    expect(ls.getAssetUsage).toHaveBeenCalledTimes(2);
  });

  it("drops an answer for an older program that arrives after a newer one", async () => {
    const { assets, ls } = fakeWorkspace();
    let finish!: (value: ReturnType<typeof answer>) => void;
    ls.getAssetUsage
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue(answer({}, 2));
    await assets.load();
    const dispose = assets.watch();
    await compiled();
    expect(workspace.assetUsage.value!.version).toBe(2);
    finish(FULL);
    await settle();
    expect(workspace.assetUsage.value!.version).toBe(2);
    dispose();
  });

  it("gives the delete check the same uses as the row, from the same answer", async () => {
    const { assets } = fakeWorkspace();
    await assets.load();
    await assets.loadUsage();
    const groups = (await assets.usedBy([`${IMAGES}/harbor.png`]))!;
    const count = groups.reduce((sum, group) => sum + group.uses.length, 0);
    expect(count).toBe(rows("uses-desc").find((row) => row.name === "harbor")!.uses);
    expect(groups.map((group) => group.uri)).toEqual([uri("main.sd"), uri("Scripts/chapter.sd"), uri("Scripts/ending.sd")]);
    expect(groups[0]!.uses[0]!.lineText).toBe("  line 1 of main.sd");
    expect(await assets.usedBy([`${IMAGES}/unused.png`])).toEqual([]);
  });

  it("counts again before a delete, so an old unused answer never deletes a thing a script now uses", async () => {
    const { assets, ls } = fakeWorkspace();
    await assets.load();
    await assets.loadUsage();
    expect(rows("uses-asc")[0]!.name).toBe("unused");
    ls.getAssetUsage.mockResolvedValue(answer({ [`${IMAGES}/unused.png`]: [use("main.sd", 7)] }, 2));
    const groups = await assets.usedBy([`${IMAGES}/unused.png`]);
    expect(groups!.flatMap((group) => group.uses.map((u) => u.lineText))).toEqual(["  line 7 of main.sd"]);
    expect(ls.getAssetUsage).toHaveBeenCalledTimes(2);
  });

  it("answers a delete from its own count while an older recount is still under way, and keeps the newer answer", async () => {
    const { assets, ls } = fakeWorkspace();
    await assets.load();
    await assets.loadUsage();
    let finish!: (value: ReturnType<typeof answer>) => void;
    ls.getAssetUsage.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    void assets.loadUsage();
    ls.getAssetUsage.mockResolvedValue(answer({ [`${IMAGES}/unused.png`]: [use("main.sd", 7)] }, 3));
    const groups = await assets.usedBy([`${IMAGES}/unused.png`]);
    expect(groups!.flatMap((group) => group.uses)).toHaveLength(1);
    finish(FULL);
    await settle();
    expect(workspace.assetUsage.value!.version).toBe(3);
    expect(rows("uses-asc")[0]!.name).not.toBe("unused");
  });

  it("forgets the last answer when a recount fails, so no reader trusts an old unused", async () => {
    const { assets, ls } = fakeWorkspace();
    await assets.load();
    await assets.loadUsage();
    expect(workspace.assetUsage.value).not.toBeNull();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    ls.getAssetUsage.mockRejectedValue(new Error("The language server is not running"));
    await assets.loadUsage();
    expect(workspace.assetUsage.value).toBeNull();
    expect(workspace.assetUsageFailed.value).toBe(PROJECT);
    expect(await assets.usedBy([`${IMAGES}/unused.png`])).toBeNull();
    expect(rows("uses-asc").map((row) => row.uses)).toEqual([0, 0, 0, 0]);
    error.mockRestore();
  });

  it("reports a failed count as unknown to the delete check and keeps the rows sorted by name", async () => {
    const { assets, ls } = fakeWorkspace();
    ls.getAssetUsage.mockRejectedValue(new Error("The language server is not running"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await assets.load();
    await assets.loadUsage();
    expect(workspace.assetUsageFailed.value).toBe(PROJECT);
    expect(await assets.usedBy([`${IMAGES}/harbor.png`])).toBeNull();
    expect(rows("uses-asc").map((row) => row.name)).toEqual(["harbor", "imani", "market", "unused"]);
    error.mockRestore();
  });

  it("sorts 2,000 things by Uses and by Story order, and searches them, without blocking a keystroke", async () => {
    const many = Array.from({ length: 2000 }, (_, i) => `${IMAGES}/thing_${String(i).padStart(4, "0")}.png`);
    workspace.assetListing.value = {
      projectId: PROJECT,
      files: Object.fromEntries(many.map((path) => [path, { modified: 1, size: 1, src: `/src/${path}` }])),
      folders: [IMAGES],
    };
    workspace.assetUsage.value = {
      projectId: PROJECT,
      version: 1,
      uses: Object.fromEntries(
        many.map((path, i) => [
          path,
          Array.from({ length: i % 5 }, (_, n) => ({ ...use(n % 2 ? "main.sd" : "Scripts/chapter.sd", i + n), path: n % 2 ? "main.sd" : "Scripts/chapter.sd" })),
        ]),
      ),
      order: ["main.sd", "Scripts/chapter.sd"],
    };
    const searched = (query: string, sort: string) =>
      assetSearch({ listing: workspace.assetListing.value!, query, sort, endings: assetEndings.peek(), usage: workspace.assetUsage.value });
    rows("uses-asc");
    searched("thing", "uses-asc");
    const timed = (run: () => unknown) => {
      const started = performance.now();
      run();
      return performance.now() - started;
    };
    let unused: ReturnType<typeof rows> = [];
    let story: ReturnType<typeof rows> = [];
    let hits: ReturnType<typeof searched> = [];
    const sorting = timed(() => {
      unused = rows("uses-asc");
      story = rows("story-asc");
    });
    const searching = timed(() => {
      hits = searched("thing_1", "uses-asc");
      searched("thing_19", "story-asc");
    });
    expect(unused[0]!.uses).toBe(0);
    expect(story.at(-1)!.uses).toBe(0);
    expect(hits[0]!.rows).toHaveLength(1000);
    expect(hits[0]!.rows[0]!.uses).toBe(0);
    expect(sorting).toBeLessThan(250);
    expect(searching).toBeLessThan(250);
  });
});
