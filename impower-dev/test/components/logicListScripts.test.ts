import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => {
  const entry = (path: string, type: string) => {
    const slash = path.lastIndexOf("/");
    const base = path.slice(slash + 1);
    const dot = base.lastIndexOf(".");
    return {
      uri: `file://p/${path}`,
      name: base.slice(0, dot),
      ext: base.slice(dot + 1),
      src: "",
      type,
      version: 0,
      size: 1,
      modified: 0,
    };
  };
  return Object.fromEntries(
    [
      entry("main.sd", "script"),
      entry("scripts/intro.sd", "script"),
      entry("scripts/util.luau", "script"),
      entry("assets/hero.png", "image"),
      entry("scripts/notes.txt", "text"),
      entry("scripts/chapter.story", "script"),
    ].map((f) => [f.uri, f]),
  );
});

vi.mock("@impower/impower-ui/components", () => {
  const Pass = ({ children }: { children?: unknown }) =>
    h("div", null, children as never);
  const Empty = () => null;
  const wrappers = new Set([
    "Button",
    "DropdownRoot",
    "DropdownTrigger",
    "Router",
    "Tabs",
    "Tab",
  ]);
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
    state: signal({ panes: { logic: { panel: "scripts", panels: {} } } }),
    trashOpen: signal(false),
  },
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      getFiles: vi.fn(async () => files),
      getFolders: vi.fn(async () => [] as string[]),
      getFileUri: (projectId: string, path: string) =>
        `file://${projectId}/${path}`,
    },
    window: {
      openFileEditor: vi.fn(),
      recordScriptChange: vi.fn(async () => undefined),
      recordAssetChange: vi.fn(async () => undefined),
    },
  },
}));

vi.mock("../../src/modules/spark-editor/workspace/useDiagnosticColor", () => ({
  useDiagnosticColor: () => "",
}));

vi.mock(
  "../../src/modules/spark-editor/components/logic-script-editor/LogicScriptEditor",
  () => ({ default: () => null }),
);

vi.mock(
  "../../src/modules/spark-editor/components/logic-scripts-editor/LogicScriptsEditor",
  () => ({ default: () => null }),
);

const { SCRIPT_FILES_GLOB, setScriptFiles } = await import(
  "../../src/modules/spark-editor/utils/scriptFiles"
);
const { default: LogicList } = await import(
  "../../src/modules/spark-editor/components/logic-list/LogicList"
);

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

const host = document.createElement("div");

afterEach(async () => {
  await act(async () => {
    render(null, host);
  });
  host.remove();
});

describe("Logic pane Scripts list", () => {
  it("lists the .luau and .sd scripts under scripts/ and no other file", async () => {
    document.body.append(host);
    await act(async () => {
      render(h(LogicList, {}), host);
    });
    await settle();

    const paths = [...host.querySelectorAll("[data-tree-row]")]
      .map((row) => row.getAttribute("data-path"))
      .sort();
    expect(paths).toEqual(["scripts/intro.sd", "scripts/util.luau"]);
  });

  it("lists a script of an ending added under File types, and drops it again when the ending goes", async () => {
    const listed = () =>
      [...host.querySelectorAll("[data-tree-row]")]
        .map((row) => row.getAttribute("data-path"))
        .sort();
    try {
      setScriptFiles("*.{sd,luau,story}");
      document.body.append(host);
      await act(async () => {
        render(h(LogicList, {}), host);
      });
      await settle();
      expect(listed()).toEqual(["scripts/chapter.story", "scripts/intro.sd", "scripts/util.luau"]);
      await act(async () => {
        setScriptFiles(SCRIPT_FILES_GLOB);
      });
      await settle();
      expect(listed()).toEqual(["scripts/intro.sd", "scripts/util.luau"]);
    } finally {
      setScriptFiles(SCRIPT_FILES_GLOB);
    }
  });
});
