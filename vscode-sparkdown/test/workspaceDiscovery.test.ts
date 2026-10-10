import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ watchers: [] as any[] }));
const root = "/workspace/.checkout/author";
const uri = (relative: string) => ({ path: `${root}/${relative}`, toString() { return this.path; } });
vi.mock("vscode", () => ({ workspace: {
  getConfiguration: () => ({ scriptFiles: "*.sd", imageFiles: "*.png", audioFiles: "*.mp3", fontFiles: "*.ttf", worldFiles: "*.js" }),
  getWorkspaceFolder: () => ({ uri: { path: "/workspace/.checkout/author" } }),
  findFiles: async (pattern: string) => pattern.endsWith(".sd") ? [
    uri("project/main.sd"), uri(".claude/worktrees/old/main.sd"), uri("project/.cache/broken.sd"), uri("node_modules/example/main.sd"),
  ] : [],
  createFileSystemWatcher: () => {
    const callbacks: Record<string, ((value: any) => void)[]> = { create: [], change: [], delete: [] };
    const event = (kind: string) => (callback: (value: any) => void) => { callbacks[kind]!.push(callback); return { dispose() {} }; };
    const watcher = { callbacks, ignoreCreateEvents: false, ignoreChangeEvents: false, ignoreDeleteEvents: false, onDidCreate: event("create"), onDidChange: event("change"), onDidDelete: event("delete"), dispose: vi.fn() };
    state.watchers.push(watcher);
    return watcher;
  },
} }));
vi.mock("../src/utils/getWorkspaceScriptFile", () => ({ getWorkspaceScriptFile: async (value: any) => ({ uri: value.path }) }));
vi.mock("../src/utils/getWorkspaceImageFile", () => ({ getWorkspaceImageFile: vi.fn() }));
vi.mock("../src/utils/getWorkspaceAudioFile", () => ({ getWorkspaceAudioFile: vi.fn() }));
vi.mock("../src/utils/getWorkspaceFontFile", () => ({ getWorkspaceFontFile: vi.fn() }));
vi.mock("../src/utils/getWorkspaceWorldFile", () => ({ getWorkspaceWorldFile: vi.fn() }));

import { getWorkspaceFiles } from "../src/utils/getWorkspaceFiles";
import { getWorkspaceFileWatchers } from "../src/utils/getWorkspaceFileWatchers";

describe("repository-root discovery (#1762)", () => {
  beforeEach(() => { state.watchers.length = 0; });
  it("loads project scripts without importing dependencies or hidden nested checkouts", async () => {
    expect((await getWorkspaceFiles()).map(file => file.uri)).toEqual([uri("project/main.sd").path]);
  });
  it("applies the same boundary to create, change and delete notifications", () => {
    const [watcher] = getWorkspaceFileWatchers();
    const events: string[] = [];
    const receive = (value: any) => { events.push(value.path); };
    watcher.onDidCreate(receive);
    watcher.onDidChange(receive);
    watcher.onDidDelete(receive);
    for (const callbacks of Object.values(state.watchers[0].callbacks) as any[]) {
      for (const callback of callbacks) {
        callback(uri("node_modules/lib/toString.js"));
        callback(uri(".claude/worktrees/old/main.sd"));
        callback(uri("project/main.sd"));
      }
    }
    expect(events).toEqual(Array(3).fill(uri("project/main.sd").path));
    watcher.dispose();
    expect(state.watchers[0].dispose).toHaveBeenCalledOnce();
  });
});
