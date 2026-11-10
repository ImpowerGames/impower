import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock(
  "@impower/sparkdown-document-views/src/modules/script-editor/SparkdownScriptEditor",
  () => ({ setLanguageServer: vi.fn() }),
);
vi.mock("../../src/modules/spark-editor/index", () => ({
  default: { init: vi.fn(async () => {}) },
}));
vi.mock("../../src/modules/spark-editor/workspace/settings/applyTheme", () => ({
  applyTheme: vi.fn(),
}));
vi.mock(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings",
  () => ({ default: { appearance: {} } }),
);
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    ls: { worker: null, connection: null },
    window: {
      store: { project: { id: "local" } },
      offerAppInstall: vi.fn(),
      refreshDeviceStorage: vi.fn(async () => {}),
    },
  },
}));

const calls: string[] = [];
const storage = {
  persisted: vi.fn(async () => {
    calls.push("persisted");
    return false;
  }),
  persist: vi.fn(async () => {
    calls.push("persist");
    return false;
  }),
};
const permissions = {
  query: vi.fn(async () => {
    calls.push("query");
    return { state: "prompt" };
  }),
};

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: permissions,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("opening the editor in a browser that would prompt for persistent storage", () => {
  it("neither asks the browser to keep the project nor shows a snackbar", async () => {
    const { snackbar } = await import(
      "../../src/modules/spark-editor/utils/snackbar"
    );
    await import("../../src/pages/index");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(storage.persist).not.toHaveBeenCalled();
    expect(calls).not.toContain("persist");
    expect(snackbar.value).toBeNull();
  });
});
