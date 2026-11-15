import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  folders: new Map<string, [string, number][]>(),
  existing: new Set<string>(),
  picked: undefined as { path: string } | undefined,
  dialogs: [] as unknown[],
  copies: [] as { from: string; to: string; overwrite: boolean }[],
  created: [] as string[],
  errors: [] as string[],
  infos: [] as string[],
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  settings: { audioFiles: "*.{mid,wav,mp3}", imageFiles: "*.{png,jpg}" } as Record<string, string>,
  files: new Set<string>(["/proj/main.sd"]),
  active: "/proj/main.sd",
}));

vi.mock("vscode", async () => {
  const { posix } = await import("node:path");
  const uri = (path: string) => ({ path, toString: () => "file://" + path });
  class FileSystemError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    FileType: { File: 1, Directory: 2 },
    FileSystemError,
    Uri: {
      joinPath: (base: { path: string }, ...parts: string[]) =>
        uri(posix.join(base.path, ...parts)),
    },
    commands: {
      registerCommand: (name: string, run: (...args: unknown[]) => unknown) => {
        state.commands.set(name, run);
        return { dispose: () => {} };
      },
    },
    window: {
      get activeTextEditor() {
        return { document: { uri: uri(state.active) } };
      },
      showOpenDialog: async (options: unknown) => {
        state.dialogs.push(options);
        return state.picked ? [uri(state.picked.path)] : undefined;
      },
      showErrorMessage: async (message: string) => {
        state.errors.push(message);
      },
      showInformationMessage: async (message: string) => {
        state.infos.push(message);
      },
    },
    workspace: {
      getWorkspaceFolder: () => ({ uri: uri("/proj") }),
      workspaceFolders: [{ uri: uri("/proj") }],
      asRelativePath: (target: { path: string }) => target.path.replace("/proj/", ""),
      getConfiguration: () => ({
        get: (key: string, fallback: string) => state.settings[key] ?? fallback,
      }),
      fs: {
        readDirectory: async (folder: { path: string }) => {
          const entries = state.folders.get(folder.path);
          if (!entries) throw new FileSystemError("FileNotFound");
          return entries;
        },
        stat: async (file: { path: string }) => {
          if (!state.files.has(file.path)) throw new FileSystemError("FileNotFound");
          return { type: 1 };
        },
        createDirectory: async (folder: { path: string }) => {
          state.created.push(folder.path);
        },
        copy: async (from: { path: string }, to: { path: string }, options: { overwrite: boolean }) => {
          if (state.existing.has(to.path)) throw new FileSystemError("FileExists");
          state.copies.push({ from: from.path, to: to.path, overwrite: options.overwrite });
        },
      },
    },
  };
});

import { activateAddAsset } from "../src/utils/activateAddAsset";

const run = (argument: unknown) => {
  activateAddAsset({ subscriptions: [] } as never);
  return state.commands.get("sparkdown.addAsset")!(argument);
};

beforeEach(() => {
  state.folders.clear();
  state.existing.clear();
  state.picked = undefined;
  state.dialogs = [];
  state.copies = [];
  state.created = [];
  state.errors = [];
  state.infos = [];
  state.files = new Set(["/proj/main.sd"]);
  state.active = "/proj/main.sd";
});

describe("sparkdown.addAsset", () => {
  test("opens the file picker for the asset's type and copies the file under the reference's name", async () => {
    state.picked = { path: "/downloads/Explosion 2.WAV" };
    expect(await run({ name: "boom", type: "audio" })).toBe(true);
    expect(state.dialogs).toEqual([
      expect.objectContaining({
        canSelectMany: false,
        canSelectFolders: false,
        filters: { Audio: ["mid", "wav", "mp3"] },
      }),
    ]);
    expect(state.copies).toEqual([
      { from: "/downloads/Explosion 2.WAV", to: "/proj/Assets/Audio/boom.WAV", overwrite: false },
    ]);
    expect(state.infos).toEqual(["Added Assets/Audio/boom.WAV."]);
  });

  test("keeps the project's own spelling of the assets and type folders", async () => {
    state.folders.set("/proj", [["assets", 2], ["main.sd", 1]]);
    state.folders.set("/proj/assets", [["images", 2], ["audio.txt", 1]]);
    state.picked = { path: "/downloads/a.png" };
    await run({ name: "alice", type: "image" });
    expect(state.copies.map((copy) => copy.to)).toEqual(["/proj/assets/images/alice.png"]);
  });

  test("adds to the game the open script belongs to when it sits in a folder of the workspace", async () => {
    state.files = new Set(["/proj/Game/main.sd", "/proj/Game/scenes/intro.sd"]);
    state.active = "/proj/Game/scenes/intro.sd";
    state.picked = { path: "/downloads/boom.wav" };
    await run({ name: "boom", type: "audio" });
    expect(state.copies.map((copy) => copy.to)).toEqual(["/proj/Game/Assets/Audio/boom.wav"]);
  });

  test("adds to the open script's own folder when no main script is above it", async () => {
    state.files = new Set(["/proj/notes/draft.sd"]);
    state.active = "/proj/notes/draft.sd";
    state.picked = { path: "/downloads/boom.wav" };
    await run({ name: "boom", type: "audio" });
    expect(state.copies.map((copy) => copy.to)).toEqual(["/proj/notes/Assets/Audio/boom.wav"]);
  });

  test("adds nothing when the picker is cancelled", async () => {
    expect(await run({ name: "boom", type: "audio" })).toBe(false);
    expect(state.copies).toEqual([]);
    expect(state.created).toEqual([]);
  });

  test("says so rather than replacing a file of that name", async () => {
    state.existing.add("/proj/Assets/Audio/boom.wav");
    state.picked = { path: "/downloads/boom.wav" };
    expect(await run({ name: "boom", type: "audio" })).toBe(false);
    expect(state.errors).toEqual(["Assets/Audio/boom.wav already exists."]);
  });

  test.each([undefined, { name: "x", type: "layered_image" }, { name: "", type: "audio" }])(
    "opens nothing for an argument %j that names no asset file",
    async (argument) => {
      expect(await run(argument)).toBe(false);
      expect(state.dialogs).toEqual([]);
    },
  );
});
