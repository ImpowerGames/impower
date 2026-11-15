import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  root: "file:///proj",
  active: "file:///proj/Game/scenes/intro.sd",
  files: new Map<string, number>(),
  copies: [] as string[],
  stats: [] as string[],
}));

vi.mock("vscode", async () => {
  const { URI, Utils } = await import("vscode-uri");
  const root = () => URI.parse(state.root);
  return {
    Uri: { joinPath: Utils.joinPath },
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    FileSystemError: class extends Error {},
    window: {
      get activeTextEditor() {
        return { document: { uri: URI.parse(state.active) } };
      },
      showOpenDialog: async () => [URI.parse("file:///downloads/boom.wav")],
      showErrorMessage: async () => {},
      showInformationMessage: async () => {},
    },
    workspace: {
      getWorkspaceFolder: (uri: { scheme: string; authority: string; path: string }) =>
        uri.scheme === root().scheme &&
        uri.authority === root().authority &&
        uri.path.startsWith(root().path.replace(/\/$/, "") + "/")
          ? { uri: root() }
          : undefined,
      get workspaceFolders() {
        return [{ uri: root() }];
      },
      getConfiguration: () => ({ get: () => "*.{wav,mp3}" }),
      asRelativePath: (uri: { path: string }) => uri.path,
      fs: {
        stat: async (uri: { toString: () => string }) => {
          state.stats.push(uri.toString());
          const type = state.files.get(uri.toString());
          if (type === undefined) throw new Error("FileNotFound");
          return { type };
        },
        readDirectory: async () => [],
        createDirectory: async () => {},
        copy: async (_from: unknown, to: { toString: () => string }) => {
          state.copies.push(to.toString());
        },
      },
    },
  };
});

import { addAsset } from "../src/utils/activateAddAsset";

const SCRIPT = ["scene start", "  ((play sound boom))", "  Hello.", "end", ""].join(String.fromCharCode(10));

const unresolvedSounds = (entry: string, scripts: string[], asset?: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      ...scripts.map((uri) => ({
        uri,
        type: "script",
        name: uri.slice(uri.lastIndexOf("/") + 1, -3),
        ext: "sd",
        version: 1,
        languageId: "sparkdown",
        text: SCRIPT,
      })),
      ...(asset ? [{ uri: asset, type: "audio", name: "boom", ext: "wav", src: asset }] : []),
    ] as never,
  });
  const quiet = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
  quiet.forEach((spy) => spy.mockImplementation(() => {}));
  try {
    const program = compiler.compile({ textDocument: { uri: entry } }).program;
    return Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d) => (typeof d.message === "string" ? d.message : d.message.value).includes("Cannot find audio named"))
      .length;
  } finally {
    quiet.forEach((spy) => spy.mockRestore());
  }
};

beforeEach(() => {
  state.root = "file:///proj";
  state.active = "file:///proj/Game/scenes/intro.sd";
  state.files = new Map([
    ["file:///proj/Game/main.sd", 1],
    ["file:///proj/main.sd", 1],
  ]);
  state.copies = [];
  state.stats = [];
});

describe("where sparkdown.addAsset puts the file", () => {
  test("in the nearest game above the open script, where the compiler then finds it", async () => {
    await addAsset({ name: "boom", type: "audio" });
    expect(state.copies).toEqual(["file:///proj/Game/Assets/Audio/boom.wav"]);
    const entry = "file:///proj/Game/main.sd";
    expect(unresolvedSounds(entry, [entry])).toBe(1);
    expect(unresolvedSounds(entry, [entry], state.copies[0])).toBe(0);
  });

  test("beside a script with no main script above it, which compiles on its own there", async () => {
    state.active = "file:///proj/notes/draft.sd";
    state.files.clear();
    await addAsset({ name: "boom", type: "audio" });
    expect(state.copies).toEqual(["file:///proj/notes/Assets/Audio/boom.wav"]);
    expect(unresolvedSounds(state.active, [state.active], "file:///proj/Assets/Audio/boom.wav")).toBe(1);
    expect(unresolvedSounds(state.active, [state.active], state.copies[0])).toBe(0);
  });

  test("in the containing folder of a multi-root workspace", async () => {
    state.root = "file:///second";
    state.active = "file:///second/Game/scenes/intro.sd";
    state.files = new Map([["file:///second/Game/main.sd", 1]]);
    await addAsset({ name: "boom", type: "audio" });
    expect(state.copies).toEqual(["file:///second/Game/Assets/Audio/boom.wav"]);
  });

  test("without looking for a main script above the workspace folder", async () => {
    state.root = "file:///proj/Game";
    state.active = "file:///proj/Game/intro.sd";
    state.files = new Map([["file:///proj/main.sd", 1]]);
    await addAsset({ name: "boom", type: "audio" });
    expect(state.copies).toEqual(["file:///proj/Game/Assets/Audio/boom.wav"]);
    expect(state.stats).toEqual(["file:///proj/Game/main.sd"]);
  });

  test("stopping at the filesystem root", async () => {
    state.root = "file:///";
    state.active = "file:///intro.sd";
    state.files.clear();
    await addAsset({ name: "boom", type: "audio" });
    expect(state.stats).toEqual(["file:///main.sd"]);
    expect(state.copies).toEqual(["file:///Assets/Audio/boom.wav"]);
  });

  test("beside a script outside every workspace folder, without searching above it", async () => {
    state.active = "file:///elsewhere/intro.sd";
    state.files = new Map([["file:///main.sd", 1]]);
    await addAsset({ name: "boom", type: "audio" });
    expect(state.stats).toEqual([]);
    expect(state.copies).toEqual(["file:///elsewhere/Assets/Audio/boom.wav"]);
  });

  test("following a main script that is a symbolic link to a file", async () => {
    state.files = new Map([["file:///proj/Game/main.sd", 65]]);
    await addAsset({ name: "boom", type: "audio" });
    expect(state.copies).toEqual(["file:///proj/Game/Assets/Audio/boom.wav"]);
  });

  test("past a folder that is only named main.sd", async () => {
    state.files = new Map([
      ["file:///proj/Game/main.sd", 2],
      ["file:///proj/main.sd", 1],
    ]);
    await addAsset({ name: "boom", type: "audio" });
    expect(state.copies).toEqual(["file:///proj/Assets/Audio/boom.wav"]);
  });
});
