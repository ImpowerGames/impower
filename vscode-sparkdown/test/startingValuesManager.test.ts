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
const OTHER = "file:///project/other.sd";

const SCRIPT = [
  "scene interrogation",
  "  choose",
  "    * [Tell the truth.]",
  "    * [Lie.]",
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

const memento = () => {
  const values = new Map<string, unknown>();
  return {
    get: (key: string, fallback?: unknown) =>
      values.has(key) ? values.get(key) : fallback,
    update: async (key: string, value: unknown) => {
      values.set(key, JSON.parse(JSON.stringify(value)));
    },
  };
};

const activate = async (
  text: string,
  workspaceState: ReturnType<typeof memento> = memento(),
) => {
  const { SparkdownStartingValuesManager } =
    await import("../src/managers/SparkdownStartingValuesManager");
  state.vscode.workspace.textDocuments = [textDocument(MAIN, text) as any];
  const manager = new SparkdownStartingValuesManager();
  manager.activate({ workspaceState, subscriptions: [] } as any);
  return { manager, workspaceState };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const edit = (
  manager: { moveThroughEdit(change: any): void },
  text: string,
  change: { rangeOffset: number; rangeLength: number; text: string },
) => {
  const document = textDocument(MAIN, text);
  state.vscode.workspace.textDocuments = [document as any];
  manager.moveThroughEdit({ document, contentChanges: [change] });
};

describe("the extension's starting values", () => {
  it("are kept in the workspace state and read again after a window reload", async () => {
    const { manager, workspaceState } = await activate(SCRIPT);

    await manager.change("interrogation", { "store:trust": "2" });
    const { manager: reloaded } = await activate(SCRIPT, workspaceState);

    expect(reloaded.values).toEqual({
      interrogation: { "store:trust": "2" },
    });
  });

  it("are cleared value by value, and a start with none left is dropped", async () => {
    const { manager } = await activate(SCRIPT);

    await manager.change("interrogation", {
      "store:trust": "2",
      "param:hour": '"nine"',
    });
    await manager.change("interrogation", { "store:trust": null });
    expect(manager.values).toEqual({
      interrogation: { "param:hour": '"nine"' },
    });
    await manager.change("interrogation", { "param:hour": null });
    expect(manager.values).toEqual({});
  });

  it("are sent on as each change is kept", async () => {
    const { manager } = await activate(SCRIPT);
    const sent: unknown[] = [];
    manager.onDidChangeValues((values) => sent.push(values));

    await manager.change("interrogation", { "store:trust": "2" });

    expect(sent).toEqual([{ interrogation: { "store:trust": "2" } }]);
  });

  it("keep an option's value on its option when lines are inserted above it", async () => {
    const { manager } = await activate(SCRIPT);
    await manager.change("interrogation", {
      [`place:0:2:${MAIN}`]: "1",
      [`place:0:3:${OTHER}`]: "2",
      "store:trust": "2",
    });
    const sent: unknown[] = [];
    manager.onDidChangeValues((values) => sent.push(values));

    edit(manager, `\n\n${SCRIPT}`, { rangeOffset: 0, rangeLength: 0, text: "\n\n" });
    await settle();

    const moved = {
      interrogation: {
        [`place:0:4:${MAIN}`]: "1",
        [`place:0:3:${OTHER}`]: "2",
        "store:trust": "2",
      },
    };
    expect(manager.values).toEqual(moved);
    expect(sent).toEqual([moved]);
  });

  it("follow an option through successive edits", async () => {
    const { manager } = await activate(SCRIPT);
    await manager.change("interrogation", { [`place:0:3:${MAIN}`]: "1" });

    const once = `\n${SCRIPT}`;
    edit(manager, once, { rangeOffset: 0, rangeLength: 0, text: "\n" });
    const firstLineEnd = once.indexOf("\n", 1);
    const twice = `${once.slice(0, firstLineEnd)}\nINSPECTOR:${once.slice(firstLineEnd)}`;
    edit(manager, twice, {
      rangeOffset: firstLineEnd,
      rangeLength: 0,
      text: "\nINSPECTOR:",
    });
    await settle();

    expect(manager.values).toEqual({
      interrogation: { [`place:0:5:${MAIN}`]: "1" },
    });
  });

  it("keep a value whose option's line was deleted, as one no longer in the script", async () => {
    const { manager } = await activate(SCRIPT);
    await manager.change("interrogation", { [`place:0:2:${MAIN}`]: "1" });
    const lines = SCRIPT.split("\n");
    const deletedStart = lines.slice(0, 2).join("\n").length + 1;
    const deletedLength = lines[2]!.length + 1;

    edit(
      manager,
      [...lines.slice(0, 2), ...lines.slice(3)].join("\n"),
      { rangeOffset: deletedStart, rangeLength: deletedLength, text: "" },
    );
    await settle();

    expect(manager.values).toEqual({
      interrogation: { [`place:0:~2:${MAIN}`]: "1" },
    });
  });

  it("leave every value in place for an edit below their lines", async () => {
    const { manager } = await activate(SCRIPT);
    await manager.change("interrogation", { [`place:0:2:${MAIN}`]: "1" });
    const sent: unknown[] = [];
    manager.onDidChangeValues((values) => sent.push(values));

    edit(manager, `${SCRIPT}\n`, {
      rangeOffset: SCRIPT.length,
      rangeLength: 0,
      text: "\n",
    });
    await settle();

    expect(manager.values).toEqual({
      interrogation: { [`place:0:2:${MAIN}`]: "1" },
    });
    expect(sent).toEqual([]);
  });
});
