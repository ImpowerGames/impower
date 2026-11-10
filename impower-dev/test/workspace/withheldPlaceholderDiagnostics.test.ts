import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangedEditorWithheldDiagnosticMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorWithheldDiagnosticMessage";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { Range } from "vscode-languageserver-protocol";

const connection = vi.hoisted(() => ({
  notifications: new Map<string, (params: unknown) => void>(),
}));
vi.mock("vscode-jsonrpc/browser", () => ({
  BrowserMessageReader: class {},
  BrowserMessageWriter: class {},
  createMessageConnection: () => ({
    onRequest: () => {},
    onNotification: (method: string, handler: (params: unknown) => void) => {
      connection.notifications.set(method, handler);
    },
    onClose: () => {},
    listen: () => {},
    dispose: () => {},
  }),
}));

import WorkspaceConfiguration from "../../src/modules/spark-editor/workspace/WorkspaceConfiguration";
import WorkspaceLanguageServer from "../../src/modules/spark-editor/workspace/WorkspaceLanguageServer";
import problems from "../../src/modules/spark-editor/workspace/problems/ProblemsStore";

const MAIN = "file://proj/main.sd";
const WARNING = "Cannot find character named `CHARACTER`";

const at = (line: number, from: number, to: number) => ({
  start: { line, character: from },
  end: { line, character: to },
});

const PLACEHOLDER = at(6, 2, 11);

const placeholderWarning = {
  range: PLACEHOLDER,
  severity: 2,
  source: "sparkdown",
  message: { kind: "markdown", value: WARNING },
};
const typedWarning = { ...placeholderWarning, range: at(9, 2, 11) };
const otherOnLine = {
  range: PLACEHOLDER,
  severity: 1,
  source: "sparkdown",
  message: "Something else",
};

const messages = (list: readonly { message: unknown }[] | undefined) =>
  (list ?? []).map(({ message }) =>
    typeof message === "string" ? message : (message as { value: string }).value,
  );

describe("the app withholds the placeholder warning the editor withholds", () => {
  let ls: WorkspaceLanguageServer;
  let heard: { uri: string; diagnostics: { message: unknown }[] }[];

  const published = (version: number, diagnostics: unknown[]) =>
    connection.notifications.get("textDocument/publishDiagnostics")?.({
      uri: MAIN,
      version,
      diagnostics,
    });

  const withheld = (version: number, range: Range | null) =>
    sendProtocolMessage(
      ChangedEditorWithheldDiagnosticMessage.type.notification({
        textDocument: { uri: MAIN, version },
        range,
      }),
    );

  const recorded = () => messages(problems.diagnostics.value[MAIN]);
  const lastHeard = () => messages(heard.at(-1)?.diagnostics);

  beforeEach(() => {
    connection.notifications.clear();
    problems.diagnostics.value = {};
    vi.stubGlobal(
      "Worker",
      class {
        onerror: unknown;
        addEventListener() {}
        postMessage() {}
      },
    );
    ls = new WorkspaceLanguageServer({
      configuration: new WorkspaceConfiguration(),
      window: {} as never,
    });
    heard = [];
    ls.onPublishedDiagnostics((params) => {
      heard.push(params as never);
    });
  });

  afterEach(() => {
    ls.stop();
    vi.unstubAllGlobals();
  });

  it("keeps the withheld range out of the store, the counts and the listeners", () => {
    withheld(5, PLACEHOLDER);
    published(5, [placeholderWarning, otherOnLine, typedWarning]);
    expect(recorded()).toEqual(["Something else", WARNING]);
    expect(problems.counts.value.problems).toBe(2);
    expect(problems.problems.value).toHaveLength(2);
    expect(lastHeard()).toEqual(["Something else", WARNING]);
    expect(heard.at(-1)?.diagnostics).not.toContain(placeholderWarning);
  });

  it("counts nothing while the only warning is the withheld placeholder", () => {
    withheld(5, PLACEHOLDER);
    published(5, [placeholderWarning]);
    expect(recorded()).toEqual([]);
    expect(problems.counts.value.problems).toBe(0);
    expect(lastHeard()).toEqual([]);
  });

  it("shows the warning at once when the caret leaves the unedited placeholder", () => {
    withheld(5, PLACEHOLDER);
    published(5, [placeholderWarning]);
    withheld(5, null);
    expect(recorded()).toEqual([WARNING]);
    expect(problems.counts.value.problems).toBe(1);
    expect(lastHeard()).toEqual([WARNING]);
  });

  it("never flashes the old warning when the placeholder is replaced", () => {
    withheld(5, PLACEHOLDER);
    published(5, [placeholderWarning]);
    withheld(6, null);
    expect(problems.counts.value.problems).toBe(0);
    expect(heard.map((p) => messages(p.diagnostics))).not.toContainEqual([
      WARNING,
    ]);
    published(6, []);
    expect(problems.counts.value.problems).toBe(0);
    published(7, [
      {
        ...placeholderWarning,
        range: at(6, 2, 8),
        message: { kind: "markdown", value: "Cannot find character named `NOBODY`" },
      },
    ]);
    expect(recorded()).toEqual(["Cannot find character named `NOBODY`"]);
  });

  it("drops the range at the release, so no later publish can stay hidden", () => {
    withheld(5, PLACEHOLDER);
    published(5, [placeholderWarning]);
    withheld(6, null);
    expect(problems.counts.value.problems).toBe(0);
    published(5, [placeholderWarning]);
    expect(recorded()).toEqual([WARNING]);
    expect(problems.counts.value.problems).toBe(1);
    expect(lastHeard()).toEqual([WARNING]);
  });

  it("re-evaluates diagnostics already received when the range goes live", () => {
    published(5, [placeholderWarning]);
    expect(problems.counts.value.problems).toBe(1);
    withheld(5, PLACEHOLDER);
    expect(problems.counts.value.problems).toBe(0);
    expect(lastHeard()).toEqual([]);
  });
});
