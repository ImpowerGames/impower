import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  uiBreakpoints: (() => Promise.resolve(undefined)) as (
    uri: unknown,
  ) => Promise<Record<string, number> | undefined>,
  requested: [] as string[],
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  const vscode = fakeVscode();
  return {
    ...vscode,
    Uri: {
      parse: (uri: string) => ({ toString: () => uri }),
      joinPath: (base: unknown, ...parts: string[]) => ({ base, parts }),
    },
  };
});
vi.mock("../src/managers/SparkProgramManager", () => ({
  SparkProgramManager: {
    instance: {
      uiBreakpoints: (uri: { toString(): string }) => {
        state.requested.push(uri.toString());
        return state.uiBreakpoints(uri);
      },
    },
  },
}));
vi.mock("../src/managers/SparkdownDocumentManager", () => ({
  SparkdownDocumentManager: {
    instance: { get: () => ({}), add: () => {} },
  },
}));

const URI = "file:///project/main.sd";
const TEXT = "screen main with\n  card\nend";

vi.mock("../src/utils/getOpenTextDocument", () => ({
  getOpenTextDocument: async (uri: { toString(): string }) => ({
    uri,
    getText: () => TEXT,
  }),
}));

const panel = () => {
  const posted: any[] = [];
  let receive: ((message: unknown) => Promise<void>) | undefined;
  const webviewPanel = {
    iconPath: undefined as unknown,
    dispose() {},
    webview: {
      html: "",
      asWebviewUri: (uri: unknown) => uri,
      postMessage: (message: any) => {
        posted.push(message);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (listener: (message: unknown) => Promise<void>) => {
        receive = listener;
        return { dispose: () => {} };
      },
    },
    onDidDispose: () => ({ dispose: () => {} }),
  };
  const send = (message: unknown) => receive!(message);
  const loads = () => posted.filter((m) => m.method === "load");
  return { webviewPanel, send, loads };
};

const restore = async () => {
  const { SparkdownScreenPreviewSerializer } = await import(
    "../src/utils/activateScreenPreview"
  );
  const preview = panel();
  const context = {
    extensionUri: "ext",
    extension: { extensionUri: "ext" },
    subscriptions: [],
  };
  await new SparkdownScreenPreviewSerializer(
    context as never,
  ).deserializeWebviewPanel(preview.webviewPanel as never, {
    textDocument: { uri: URI },
    ranges: [
      {
        start: { line: 0, character: 0 },
        end: { line: 2, character: 3 },
      },
    ],
  });
  return preview;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the screen preview's load message carries the project's breakpoints", () => {
  beforeEach(() => {
    state.requested.length = 0;
    state.uiBreakpoints = () => Promise.resolve(undefined);
  });

  it("sends the table the language server resolves for the document", async () => {
    state.uiBreakpoints = () => Promise.resolve({ sm: 400 });
    const preview = await restore();
    await preview.send({ method: "initialized" });
    await settle();
    expect(state.requested).toEqual([URI]);
    expect(preview.loads()).toHaveLength(1);
    expect(preview.loads()[0].params).toMatchObject({
      textDocument: { uri: URI },
      text: TEXT,
      breakpoints: { sm: 400 },
    });
  });

  it("drops a reply that a newer load has overtaken", async () => {
    const replies: ((value: Record<string, number>) => void)[] = [];
    state.uiBreakpoints = () =>
      new Promise((resolve) => replies.push(resolve));
    const preview = await restore();
    void preview.send({ method: "initialized" });
    void preview.send({ method: "initialized" });
    await settle();
    replies[1]!({ sm: 420 });
    await settle();
    replies[0]!({ sm: 410 });
    await settle();
    expect(preview.loads().map((m) => m.params.breakpoints)).toEqual([
      { sm: 420 },
    ]);
  });

  it("still loads with the builtin table when the request fails", async () => {
    const failure = new Error("no server");
    state.uiBreakpoints = () => Promise.reject(failure);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const preview = await restore();
    await preview.send({ method: "initialized" });
    await settle();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(URI), failure);
    logged.mockRestore();
    expect(preview.loads()).toHaveLength(1);
    expect(preview.loads()[0].params.breakpoints).toBeUndefined();
    expect(preview.loads()[0].params.text).toBe(TEXT);
  });
});
