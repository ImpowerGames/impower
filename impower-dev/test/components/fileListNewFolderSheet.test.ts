import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  getFiles: vi.fn(async () => ({})),
  getFolders: vi.fn(async () => [] as string[]),
  getFileUri: (project: string, path: string) => `file://${project}/${path}`,
  getRelativePath: (project: string, uri: string) =>
    uri.slice(`file://${project}/`.length),
  createFolder: vi.fn(async () => []),
}));

vi.mock("@impower/impower-ui/components", async () => {
  const dropdown = await import(
    "../../../packages/impower-ui/src/components/dropdown/Dropdown"
  );
  const Empty = () => null;
  const Button = ({ children, ...props }: Record<string, unknown>) =>
    h("button", props, children as never);
  return new Proxy(
    { ...dropdown, Button },
    {
      has: (_, key) => key !== "then",
      get: (target, key) =>
        key === "then" ? undefined : (Reflect.get(target, key) ?? Empty),
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
    signals: { projectId: signal("p"), syncStatus: signal("idle") },
    state: signal({}),
    trashOpen: signal(false),
  },
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs,
    window: {
      openFileEditor: vi.fn(),
      recordScriptChange: vi.fn(async () => undefined),
      recordAssetChange: vi.fn(async () => undefined),
    },
  },
}));

vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem() {},
  removeItem() {},
});
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

const { default: FileList } = await import(
  "../../src/modules/spark-editor/components/file-list/FileList"
);

const settle = async (ms = 20) => {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }
};

let host: HTMLDivElement | undefined;
afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
  }
});

describe("New Folder in the narrow layout's menu sheet", () => {
  it("creates the folder when New Folder is chosen from the sheet", async () => {
    host = document.createElement("div");
    document.body.append(host);
    await act(async () => render(h(FileList, { rootDir: "assets" }), host!));
    await settle();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="More options"]',
    );
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());
    await settle();
    const item = [
      ...document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
    ].find((el) => el.textContent?.trim() === "New Folder");
    expect(item).toBeDefined();
    await act(async () => item!.click());
    await settle(80);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(fs.createFolder).toHaveBeenCalledWith("p", "assets/New Folder");
  });
});
