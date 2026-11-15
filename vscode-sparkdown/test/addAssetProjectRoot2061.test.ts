import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  DEFAULT_MAIN_SCRIPT_FILENAME,
  projectRootUri,
  projectScripts,
} from "@impower/sparkdown/src/compiler/utils/projectMembership";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  copies: [] as string[],
  errors: [] as string[],
  dialogs: 0,
}));

vi.mock("vscode", async () => {
  const { URI, Utils } = await import("vscode-uri");
  const folder = URI.parse("file:///proj");
  return {
    Uri: { parse: (text: string) => URI.parse(text), joinPath: Utils.joinPath },
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    FileSystemError: class extends Error {},
    window: {
      showOpenDialog: async () => {
        state.dialogs += 1;
        return [URI.parse("file:///downloads/boom.wav")];
      },
      showErrorMessage: async (message: string) => {
        state.errors.push(message);
      },
      showInformationMessage: async () => {},
    },
    workspace: {
      getWorkspaceFolder: (uri: { scheme: string; path: string }) =>
        uri.scheme === folder.scheme && uri.path.startsWith(`${folder.path}/`) ? { uri: folder } : undefined,
      workspaceFolders: [{ uri: folder }],
      getConfiguration: () => ({ get: () => "*.{wav,mp3}" }),
      asRelativePath: (uri: { path: string }) => uri.path,
      fs: {
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

const unresolvedSounds = (entry: string, asset?: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: entry, type: "script", name: "main", ext: "sd", version: 1, languageId: "sparkdown", text: SCRIPT },
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
  state.copies = [];
  state.errors = [];
  state.dialogs = 0;
});

describe("sparkdown.addAsset with the root of the program that reported the problem", () => {
  test.each([
    ["a game nested in the open folder", "file:///proj/Game/main.sd"],
    ["a script compiled on its own", "file:///proj/notes/draft.sd"],
  ])("adds the file where the compiler of %s finds it", async (_, entry) => {
    expect(unresolvedSounds(entry)).toBe(1);
    const root = projectRootUri(entry)!;
    expect(await addAsset({ name: "boom", type: "audio", root })).toBe(true);
    expect(state.copies).toEqual([`${root}Assets/Audio/boom.wav`]);
    expect(unresolvedSounds(entry, state.copies[0])).toBe(0);
  });

  test("declines a script in a hidden folder, which compiles on its own where VS Code loads no assets", async () => {
    const main = "file:///proj/main.sd";
    const draft = "file:///proj/.drafts/draft.sd";
    expect(projectScripts(main, [main, draft], DEFAULT_MAIN_SCRIPT_FILENAME)).toEqual([main]);
    expect(await addAsset({ name: "boom", type: "audio", root: projectRootUri(draft)! })).toBe(false);
    expect(state.dialogs).toBe(0);
    expect(state.copies).toEqual([]);
    expect(state.errors).toHaveLength(1);
  });

  test("declines a script outside the open folder", async () => {
    expect(await addAsset({ name: "boom", type: "audio", root: "file:///elsewhere/" })).toBe(false);
    expect(state.dialogs).toBe(0);
    expect(state.copies).toEqual([]);
    expect(state.errors).toHaveLength(1);
  });
});
