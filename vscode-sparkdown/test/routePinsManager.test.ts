import { describe, expect, it, vi } from "vitest";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
  return state.vscode;
});

const MAIN = "file:///project/main.sd";

const SCRIPT = [
  "scene interrogation",
  "  choose",
  "    * [Tell the truth.]",
  "  end",
  "end",
].join("\n");

const textDocument = (uri: string, text: string) => {
  const lines = text.split("\n");
  const starts = lines.map((_, i) =>
    lines.slice(0, i).reduce((sum, line) => sum + line.length + 1, 0),
  );
  return {
    uri: { toString: () => uri },
    lineCount: lines.length,
    lineAt: (line: number) => ({
      range: {
        start: { line, character: 0 },
        end: { line, character: lines[line]!.length },
      },
    }),
    offsetAt: (position: { line: number; character: number }) =>
      starts[position.line]! + position.character,
    positionAt: (offset: number) => {
      let line = 0;
      while (line + 1 < starts.length && starts[line + 1]! <= offset) {
        line += 1;
      }
      return { line, character: offset - starts[line]! };
    },
  };
};

/** Workspace state as VS Code keeps it: an update is readable at once and
 *  saved later, when `save` is called. */
const workspaceState = () => {
  const values = new Map<string, unknown>();
  const pendingSaves: (() => void)[] = [];
  return {
    get: (key: string, fallback?: unknown) =>
      values.has(key) ? values.get(key) : fallback,
    update: (key: string, value: unknown) => {
      values.set(key, value);
      return new Promise<void>((resolve) => pendingSaves.push(resolve));
    },
    save: () => {
      for (const resolve of pendingSaves.splice(0)) {
        resolve();
      }
    },
  };
};

const activate = async (text: string) => {
  const { SparkdownRoutePinsManager } =
    await import("../src/managers/SparkdownRoutePinsManager");
  const document = textDocument(MAIN, text);
  state.vscode.workspace.textDocuments = [document as any];
  const memento = workspaceState();
  const manager = new SparkdownRoutePinsManager();
  manager.activate({ workspaceState: memento, subscriptions: [] } as any);
  return { manager, memento };
};

describe("the extension's answer to a change of pins", () => {
  it("is every pin kept once the change is saved", async () => {
    const { manager, memento } = await activate(SCRIPT);

    const answer = manager.change({ add: [{ uri: MAIN, line: 2, offer: 1 }] });
    memento.save();

    expect(await answer).toEqual([{ uri: MAIN, line: 2, offer: 1 }]);
  });

  it("includes a line move an edit made while the change was being saved", async () => {
    const { manager, memento } = await activate(SCRIPT);

    const sent: unknown[] = [];
    manager.onDidChangePins((pins) => sent.push(pins));
    const answer = manager.change({ add: [{ uri: MAIN, line: 2, offer: 1 }] });
    const edited = `\n${SCRIPT}`;
    const document = textDocument(MAIN, edited);
    state.vscode.workspace.textDocuments = [document as any];
    manager.moveThroughEdit({
      document,
      contentChanges: [{ rangeOffset: 0, rangeLength: 0, text: "\n" }],
    } as any);
    memento.save();

    expect(await answer).toEqual([{ uri: MAIN, line: 3, offer: 1 }]);
    expect(manager.pins).toEqual([{ uri: MAIN, line: 3, offer: 1 }]);
    expect(sent.at(-1)).toEqual([{ uri: MAIN, line: 3, offer: 1 }]);
  });
});
