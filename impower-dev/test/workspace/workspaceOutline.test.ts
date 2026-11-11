import type { PublishDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PublishDiagnosticsMessage";
import { signal } from "@preact/signals";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentSymbol } from "vscode-languageserver-protocol";
import WorkspaceOutline, {
  firstContentLine,
} from "../../src/modules/spark-editor/workspace/WorkspaceOutline";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const MAIN = "file://p/main.sd";
const OTHER = "file://p/other.sd";

const scene = (name: string): DocumentSymbol => ({
  name,
  kind: 5,
  range: { start: { line: 1, character: 0 }, end: { line: 3, character: 3 } },
  selectionRange: {
    start: { line: 1, character: 0 },
    end: { line: 1, character: 6 + name.length },
  },
});

const setup = () => {
  const opened = signal<string | undefined>(MAIN);
  let publish: (params: PublishDiagnosticsParams) => void = () => {};
  const getDocumentSymbols = vi.fn(async (uri: string) => [
    scene(uri === MAIN ? "harbor" : "dock"),
  ]);
  const outline = new WorkspaceOutline({
    openedUri: () => opened.value,
    getDocumentSymbols,
    getFileText: async (uri) =>
      uri === MAIN ? "\n// note\nscene harbor\n" : "scene dock\n",
    onPublishedDiagnostics: (listener) => {
      publish = listener;
      return () => {};
    },
  });
  return {
    outline,
    opened,
    publish: (p: PublishDiagnosticsParams) => publish(p),
    getDocumentSymbols,
  };
};

let current: WorkspaceOutline | undefined;

afterEach(() => {
  current?.dispose();
  current = undefined;
  workspace.outline.value = null;
});

describe("the outline's symbol source", () => {
  it("reads the opened script's symbols, and again whenever its diagnostics are published", async () => {
    const { outline, publish, getDocumentSymbols } = setup();
    current = outline;
    await vi.waitFor(() => expect(workspace.outline.value?.uri).toBe(MAIN));
    expect(workspace.outline.value!.symbols.map((s) => s.name)).toEqual([
      "harbor",
    ]);
    expect(workspace.outline.value!.firstContentLine).toBe(2);
    const error = {
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 1 },
      },
      message: "broken",
      severity: 1 as const,
    };
    publish({ uri: OTHER, diagnostics: [error] });
    expect(getDocumentSymbols).toHaveBeenCalledTimes(1);
    publish({ uri: MAIN, diagnostics: [error] });
    await vi.waitFor(() =>
      expect(workspace.outline.value!.diagnostics).toEqual([error]),
    );
    expect(getDocumentSymbols).toHaveBeenCalledTimes(2);
  });

  it("follows the opened script and keeps the diagnostics last published for it", async () => {
    const { outline, opened, publish } = setup();
    current = outline;
    const warning = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: "odd",
      severity: 2 as const,
    };
    publish({ uri: OTHER, diagnostics: [warning] });
    opened.value = OTHER;
    await vi.waitFor(() => expect(workspace.outline.value?.uri).toBe(OTHER));
    expect(workspace.outline.value!.symbols.map((s) => s.name)).toEqual([
      "dock",
    ]);
    expect(workspace.outline.value!.diagnostics).toEqual([warning]);
    opened.value = undefined;
    await vi.waitFor(() => expect(workspace.outline.value).toBeNull());
  });

  it("finds the first line with content, skipping blank and comment lines", () => {
    expect(firstContentLine("\n  \n// x\nVAR = 1\n")).toBe(3);
    expect(firstContentLine("\n// only\n")).toBeUndefined();
    expect(firstContentLine("/* a\nnote */\n\nVAR = 1\n")).toBe(3);
    expect(firstContentLine("/* a */ /* b\nc */ VAR = 1\n")).toBe(1);
    expect(firstContentLine("/*x*/\n/* never closed\nVAR = 1\n")).toBeUndefined();
  });
});
