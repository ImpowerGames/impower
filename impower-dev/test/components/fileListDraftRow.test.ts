import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  getFiles: vi.fn(async () => ({})),
  getFileUri: (projectId: string, path: string) => `file://${projectId}/${path}`,
  getRelativePath: (projectId: string, uri: string) =>
    uri.slice(`file://${projectId}/`.length),
  createFiles: vi.fn(async () => undefined),
}));

const changes = vi.hoisted(() => ({
  recordScriptChange: vi.fn(async () => undefined),
  recordAssetChange: vi.fn(async () => undefined),
}));

vi.mock("@impower/impower-ui/components", () => {
  const Pass = ({ children }: { children?: unknown }) =>
    h("div", null, children as never);
  const Empty = () => null;
  const wrappers = new Set(["Button", "DropdownRoot", "DropdownTrigger"]);
  return new Proxy(
    {},
    {
      has: (_, key) => key !== "then",
      get: (_, key) =>
        key === "then"
          ? undefined
          : wrappers.has(String(key))
            ? Pass
            : Empty,
    },
  );
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    scrollOffset: 0,
    getTotalSize: () => count * 64,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 64,
        size: 64,
      })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

vi.mock("../../src/modules/spark-editor/workspace/WorkspaceStore", () => ({
  default: {
    signals: {
      projectId: signal("p"),
      syncStatus: signal("idle"),
    },
    state: signal({}),
    trashOpen: signal(false),
  },
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs,
    window: {
      openFileEditor: vi.fn(),
      recordScriptChange: changes.recordScriptChange,
      recordAssetChange: changes.recordAssetChange,
    },
  },
}));

const { default: FileList } = await import(
  "../../src/modules/spark-editor/components/file-list/FileList"
);
const { requestNewEntry } = await import(
  "../../src/modules/spark-editor/utils/newEntryDraft"
);

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

const hosts: HTMLElement[] = [];

const mountWithDraft = async (rootDir: string, ext: string) => {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  await act(async () => {
    render(h(FileList, { rootDir }), host);
  });
  await settle();
  await act(async () => {
    requestNewEntry(rootDir, ext);
  });
  await settle();
  return host;
};

describe("FileList new-file draft row", () => {
  beforeEach(() => {
    fs.createFiles.mockClear();
  });

  afterEach(async () => {
    for (const host of hosts.splice(0)) {
      await act(async () => {
        render(null, host);
      });
      host.remove();
    }
    await settle();
  });

  it.each([
    ["scripts", "sd"],
    ["assets", "png"],
  ])(
    "opens a %s draft with an empty name and no sentinel text",
    async (rootDir, ext) => {
      const host = await mountWithDraft(rootDir, ext);

      const input = host.querySelector<HTMLInputElement>("[data-tree-row] input");
      expect(input).not.toBeNull();
      expect(input?.value).toBe("");
      expect(host.textContent).not.toMatch(/new/);
    },
  );

  it("creates the draft under the typed name on Enter", async () => {
    const host = await mountWithDraft("scripts", "sd");
    const input = host.querySelector<HTMLInputElement>("[data-tree-row] input")!;

    await act(async () => {
      input.value = "intro";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await settle();

    expect(fs.createFiles).toHaveBeenCalledWith({
      files: [{ uri: "file://p/scripts/intro.sd", data: expect.any(ArrayBuffer) }],
    });
  });

  it.each([
    ["scripts", "png", "hero", "assets/hero.png"],
    ["assets", "sd", "intro", "scripts/intro.sd"],
    ["scripts", "sd", "intro", "scripts/intro.sd"],
  ])(
    "files a %s .%s draft where the layout migration would place it",
    async (rootDir, ext, name, expected) => {
      const host = await mountWithDraft(rootDir, ext);
      const input = host.querySelector<HTMLInputElement>("[data-tree-row] input")!;

      await act(async () => {
        input.value = name;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      await settle();

      expect(fs.createFiles).toHaveBeenCalledWith({
        files: [{ uri: `file://p/${expected}`, data: expect.any(ArrayBuffer) }],
      });
    },
  );

  it.each([
    ["scripts", "luau", "util", true],
    ["scripts", "sd", "intro", true],
    ["assets", "png", "hero", false],
  ])(
    "records a %s .%s draft's creation as a script change: %s",
    async (rootDir, ext, name, isScript) => {
      changes.recordScriptChange.mockClear();
      changes.recordAssetChange.mockClear();
      const host = await mountWithDraft(rootDir, ext);
      const input = host.querySelector<HTMLInputElement>("[data-tree-row] input")!;

      await act(async () => {
        input.value = name;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      await settle();

      expect(fs.createFiles).toHaveBeenCalledWith({
        files: [
          {
            uri: `file://p/${rootDir}/${name}.${ext}`,
            data: expect.any(ArrayBuffer),
          },
        ],
      });
      expect(changes.recordScriptChange).toHaveBeenCalledTimes(
        isScript ? 1 : 0,
      );
      expect(changes.recordAssetChange).toHaveBeenCalledTimes(
        isScript ? 0 : 1,
      );
    },
  );
});
