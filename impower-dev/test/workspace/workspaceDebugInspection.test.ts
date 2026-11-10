import type { DebugVariableNode } from "@impower/spark-web-player/src/components/DebugVariables/DebugVariables";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceDebugClient, {
  type DebugAdapter,
} from "../../src/modules/spark-editor/workspace/WorkspaceDebugClient";
import {
  frameEntries,
  watchEntries,
} from "../../src/modules/spark-editor/workspace/WorkspaceDebugInspection";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const MAIN = "file:///local/main.sd";

type Answer = Partial<DebugProtocol.Response> | undefined;

const VARS_REF = 11;
const TEMPS_REF = 12;
const DEFINES_REF = 13;
const PARTY_REF = 21;
const BAG_REF = 31;
const BAG_A_REF = 32;

const ODD_NAMES = ["__proto__", "constructor", "toString", "a/b", "a.b"];

const story = () => {
  const values = new Map<string, string>([
    ["gold", "3"],
    ["mood", "\"calm\""],
  ]);
  const temps = new Map<number, Map<string, string>>([
    [1, new Map([["bag", "2"]])],
    [0, new Map([["coin", "9"]])],
  ]);
  let refuseSet: string | null = null;
  let noData = false;
  let names = ["shop", "start"];
  let empty = false;
  let withBag = false;
  let refuseStack = false;
  const answer = (request: DebugProtocol.Request): Answer => {
    const args = request.arguments as Record<string, any>;
    switch (request.command) {
      case "stackTrace":
        if (refuseStack) {
          return { success: false, message: "No stack." };
        }
        return {
          body: empty
            ? { stackFrames: [], totalFrames: 0 }
            : {
                stackFrames: [
                  { id: 1, name: names[0], line: 11, column: 2, source: { path: MAIN } },
                  { id: 0, name: names[1], line: 3, column: 0, source: { path: MAIN } },
                ],
                totalFrames: 2,
              },
        };
      case "scopes":
        return {
          body: {
            scopes: [
              { name: "Temps", variablesReference: TEMPS_REF + args.frameId * 100, expensive: false, presentationHint: "locals" },
              { name: "Vars", variablesReference: VARS_REF, expensive: false },
              { name: "Defines", variablesReference: DEFINES_REF, expensive: true },
            ],
          },
        };
      case "variables": {
        const ref = args.variablesReference as number;
        if (ref === VARS_REF) {
          return {
            body: {
              variables: [
                ...[...values].map(([name, value]) => ({ name, value, variablesReference: 0 })),
                { name: "party", value: "{...}", variablesReference: PARTY_REF },
                ...(withBag ? [{ name: "bag", value: "{...}", variablesReference: BAG_REF }] : []),
              ],
            },
          };
        }
        if (ref === BAG_REF) {
          return {
            body: {
              variables: [
                { name: "a/b", value: "1", variablesReference: 0 },
                { name: "a", value: "{...}", variablesReference: BAG_A_REF },
              ],
            },
          };
        }
        if (ref === BAG_A_REF) {
          return { body: { variables: [{ name: "b", value: "2", variablesReference: 0 }] } };
        }
        if (ref === PARTY_REF) {
          return { body: { variables: [{ name: "1", value: "\"Ada\"", variablesReference: 0 }] } };
        }
        const frame = Math.floor((ref - TEMPS_REF) / 100);
        return {
          body: {
            variables: [...(temps.get(frame) ?? [])].map(([name, value]) => ({ name, value, variablesReference: 0 })),
          },
        };
      }
      case "evaluate": {
        const value = values.get(args.expression) ?? temps.get(args.frameId)?.get(args.expression);
        if (value !== undefined) {
          return { body: { result: value, variablesReference: 0 } };
        }
        return args.context === "hover"
          ? { success: false, message: "not available in this frame" }
          : { body: { result: "undefined", type: "undefined", variablesReference: 0 } };
      }
      case "setVariable":
        if (refuseSet) {
          return { success: false, message: refuseSet };
        }
        values.set(args.name, args.value);
        return { body: { value: args.value } };
      case "dataBreakpointInfo": {
        const ref = args.variablesReference as number;
        const frame = Math.floor((ref - TEMPS_REF) / 100);
        const dataId = noData ? null : ref === VARS_REF ? args.name : `frame${frame}.${args.name}`;
        return { body: { dataId, description: dataId ?? "Value will never change" } };
      }
      case "setDataBreakpoints":
        return { body: { breakpoints: args.breakpoints.map(() => ({ verified: true })) } };
      default:
        return {};
    }
  };
  return {
    answer,
    set: (name: string, value: string) => {
      values.set(name, value);
    },
    refuseSet: (message: string | null) => {
      refuseSet = message;
    },
    noData: () => {
      noData = true;
    },
    local: (frame: number, name: string, value: string) => {
      temps.get(frame)!.set(name, value);
    },
    name: (inner: string, outer: string) => {
      names = [inner, outer];
    },
    emptyStack: () => {
      empty = true;
    },
    refuseStack: () => {
      refuseStack = true;
    },
    bag: () => {
      withBag = true;
    },
  };
};

const fakeAdapter = (answer: (request: DebugProtocol.Request) => Answer) => {
  const requests: DebugProtocol.Request[] = [];
  let send: (message: DebugProtocol.ProtocolMessage) => void = () => {};
  let seq = 0;
  let holding: ((request: DebugProtocol.Request) => boolean) | null = null;
  const held: (() => void)[] = [];
  const adapter: DebugAdapter = {
    handleMessage(message) {
      const request = message as DebugProtocol.Request;
      requests.push(request);
      const response = {
        seq: 0,
        type: "response",
        request_seq: request.seq,
        command: request.command,
        success: true,
        ...answer(request),
      } as DebugProtocol.Response;
      const reply = () => send({ ...response, seq: ++seq });
      if (holding?.(request)) {
        held.push(reply);
      } else {
        reply();
      }
    },
    onDidSendMessage(listener) {
      send = listener;
    },
    dispose: vi.fn(),
  };
  return {
    adapter,
    requests,
    commands: () => requests.map((r) => r.command),
    event: (event: string, body: unknown) =>
      send({ seq: ++seq, type: "event", event, body } as DebugProtocol.Event),
    hold: (expression: string) => {
      holding = (request) =>
        request.command === "evaluate" &&
        (request.arguments as { expression?: string }).expression === expression;
    },
    holdWhen: (test: (request: DebugProtocol.Request) => boolean) => {
      holding = test;
    },
    held: () => held.length,
    release: () => {
      holding = null;
      held.splice(0).forEach((reply) => reply());
    },
  };
};

let ending: WorkspaceDebugClient | undefined;
const saved: (readonly string[])[] = [];

const withWatch = (watch: string[]) => {
  workspace.current = {
    ...workspace.current,
    debug: { ...workspace.current.debug, breakpoints: {}, watch },
  };
};

const begin = async (watch: string[] = []) => {
  withWatch(watch);
  const game = story();
  const fake = fakeAdapter(game.answer);
  const debug = new WorkspaceDebugClient({
    createAdapter: async () => fake.adapter,
    saveWatch: (expressions) => {
      saved.push(expressions);
      withWatch([...expressions]);
    },
    source: (uri) => ({ path: uri.slice(uri.lastIndexOf("/") + 1), inProject: true }),
  });
  ending = debug;
  await debug.start(MAIN);
  return { debug, fake, game };
};

const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const stop = async (fake: ReturnType<typeof fakeAdapter>) => {
  fake.event("stopped", { reason: "step", threadId: 0 });
  await vi.waitFor(() => expect(workspace.debugInspection.value.status).toBe("paused"));
  await vi.waitFor(() => expect(fake.commands().at(-1)).not.toBe("scopes"));
  await settle();
};

const state = () => workspace.debugInspection.value;

const node = (...names: string[]): DebugVariableNode => {
  let list: readonly DebugVariableNode[] | undefined = state().variables;
  let found: DebugVariableNode | undefined;
  for (const name of names) {
    found = list?.find((n) => n.name === name);
    list = found?.children;
  }
  if (!found) {
    throw new Error(`No row ${names.join(" > ")}`);
  }
  return found;
};

const key = (...names: string[]) => node(...names).key;

const tree = () =>
  state().variables.map((scope) => ({
    name: scope.name,
    expanded: scope.expanded,
    children: scope.children?.map((v) => `${v.name}=${v.value}`),
  }));

const sentBreakpoints = (fake: ReturnType<typeof fakeAdapter>) =>
  (fake.requests.findLast((r) => r.command === "setDataBreakpoints")?.arguments as
    | { breakpoints: { dataId: string }[] }
    | undefined)?.breakpoints.map((b) => b.dataId);

beforeEach(() => {
  saved.length = 0;
});

afterEach(() => {
  ending?.end();
  ending = undefined;
});

describe("the web editor's Variables, Watch and Call stack inspection", () => {
  it("knows no run before a start and a running story after it", async () => {
    expect(state().status).toBe("none");
    await begin();
    expect(state().status).toBe("running");
    ending!.end();
    expect(state().status).toBe("none");
  });

  it("asks for the stack, the frame's scopes, their variables and each watch at a stop, and the cards receive them", async () => {
    const { fake } = await begin(["gold", "silver"]);
    const before = fake.requests.length;
    await stop(fake);
    const asked = fake.requests.slice(before).map((r) => [r.command, r.arguments]);
    expect(asked).toEqual([
      ["stackTrace", { threadId: 0 }],
      ["scopes", { frameId: 1 }],
      ["variables", { variablesReference: VARS_REF }],
      ["variables", { variablesReference: TEMPS_REF + 100 }],
      ["evaluate", { expression: "gold", frameId: 1, context: "watch" }],
      ["evaluate", { expression: "silver", frameId: 1, context: "watch" }],
    ]);
    expect(tree()).toEqual([
      { name: "Vars", expanded: true, children: ["gold=3", "mood=\"calm\"", "party={...}"] },
      { name: "Temps", expanded: true, children: ["bag=2"] },
      { name: "Defines", expanded: false, children: undefined },
    ]);
    expect(watchEntries(state(), workspace.watchExpressions.value)).toEqual([
      { key: "0", expression: "gold", value: "3" },
      { key: "1", expression: "silver", error: "not available in this frame" },
    ]);
    expect(frameEntries(state())).toEqual([
      { id: 1, name: "shop", location: "main.sd:12", inProject: true, selected: true },
      { id: 0, name: "start", location: "main.sd:4", inProject: true, selected: false },
    ]);
  });

  it("lets a cheap scope's direct values be watched for changes and its scalar values, inside tables too, be edited", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.toggle(key("Vars", "party"));
    const gold = node("Vars", "gold");
    const party = node("Vars", "party");
    expect([gold.editable, gold.breakable]).toEqual([true, true]);
    expect([party.editable, party.expandable, party.expanded]).toEqual([false, true, true]);
    expect(party.children!.map((v) => [v.name, v.editable, v.breakable])).toEqual([["1", true, false]]);
  });

  it("keeps a branch open across stops and loads it again at the next stop", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.toggle(key("Vars", "party"));
    await stop(fake);
    expect(fake.commands().filter((c) => c === "variables").length).toBeGreaterThanOrEqual(5);
    expect(node("Vars", "party").children!.map((v) => v.value)).toEqual(["\"Ada\""]);
  });

  it("selects a caller frame and reads that frame's locals and watches", async () => {
    const { fake, debug } = await begin(["coin"]);
    await stop(fake);
    await debug.inspection.selectFrame(0);
    expect(fake.requests.findLast((r) => r.command === "scopes")!.arguments).toEqual({ frameId: 0 });
    expect(tree()[1]).toEqual({ name: "Temps", expanded: true, children: ["coin=9"] });
    expect(watchEntries(state(), ["coin"])).toEqual([{ key: "0", expression: "coin", value: "9" }]);
    expect(frameEntries(state()).map((f) => f.selected)).toEqual([false, true]);
  });

  it("changes a value through setVariable and shows the new value and the watches that read it", async () => {
    const { fake, debug } = await begin(["gold"]);
    await stop(fake);
    debug.inspection.edit(key("Vars", "gold"));
    expect(state().editing).toBe(key("Vars", "gold"));
    await debug.inspection.setValue(key("Vars", "gold"), "12");
    expect(fake.requests.find((r) => r.command === "setVariable")!.arguments).toEqual({
      variablesReference: VARS_REF,
      name: "gold",
      value: "12",
    });
    expect(state().editing).toBeNull();
    expect(tree()[0]!.children![0]).toBe("gold=12");
    expect(watchEntries(state(), ["gold"])[0]!.value).toBe("12");
  });

  it("keeps the old value and shows the adapter's message under the row when setVariable is refused", async () => {
    const { fake, debug, game } = await begin();
    await stop(fake);
    game.refuseSet("Expected a value.");
    await debug.inspection.setValue(key("Vars", "gold"), "ten");
    expect([node("Vars", "gold").value, node("Vars", "gold").message]).toEqual(["3", "Expected a value."]);
    debug.inspection.edit(key("Vars", "gold"));
    expect(node("Vars", "gold").message).toBeUndefined();
  });

  it("sets and clears a data breakpoint through dataBreakpointInfo and setDataBreakpoints, marking the row", async () => {
    const { fake, debug, game } = await begin();
    await stop(fake);
    await debug.inspection.breakOnChange(key("Vars", "gold"), true);
    expect(fake.requests.find((r) => r.command === "dataBreakpointInfo")!.arguments).toEqual({
      variablesReference: VARS_REF,
      name: "gold",
    });
    expect(fake.requests.findLast((r) => r.command === "setDataBreakpoints")!.arguments).toEqual({
      breakpoints: [{ dataId: "gold", accessType: "write" }],
    });
    expect(node("Vars", "gold").breaking).toBe(true);
    await debug.inspection.breakOnChange(key("Vars", "gold"), false);
    expect(fake.requests.findLast((r) => r.command === "setDataBreakpoints")!.arguments).toEqual({
      breakpoints: [],
    });
    expect(node("Vars", "gold").breaking).toBe(false);
    game.noData();
    await debug.inspection.breakOnChange(key("Vars", "mood"), true);
    expect([node("Vars", "mood").breaking, node("Vars", "mood").message]).toEqual([false, "Value will never change"]);
  });

  it("keeps Break when value changes on a local to the frame it was set in, apart from a caller's local of the same name", async () => {
    const { fake, debug, game } = await begin();
    game.local(1, "count", "1");
    game.local(0, "count", "5");
    await stop(fake);
    const count = () => node("Temps", "count");
    await debug.inspection.breakOnChange(count().key, true);
    expect(sentBreakpoints(fake)).toEqual(["frame1.count"]);
    expect(count().breaking).toBe(true);
    await debug.inspection.selectFrame(0);
    expect([count().value, count().breaking]).toEqual(["5", false]);
    await debug.inspection.breakOnChange(count().key, true);
    expect(sentBreakpoints(fake)).toEqual(["frame1.count", "frame0.count"]);
    await debug.inspection.selectFrame(1);
    expect([count().value, count().breaking]).toEqual(["1", true]);
    await debug.inspection.breakOnChange(count().key, false);
    expect(sentBreakpoints(fake)).toEqual(["frame0.count"]);
    await debug.inspection.selectFrame(0);
    expect(count().breaking).toBe(true);
  });

  it("tells apart two frames with the same name by the debugger's data ID of each local", async () => {
    const { fake, debug, game } = await begin();
    game.name("<anonymous>", "<anonymous>");
    game.local(1, "count", "1");
    game.local(0, "count", "5");
    await stop(fake);
    const count = () => node("Temps", "count");
    await debug.inspection.breakOnChange(count().key, true);
    expect(count().breaking).toBe(true);
    await debug.inspection.selectFrame(0);
    expect([count().value, count().breaking]).toEqual(["5", false]);
    await debug.inspection.breakOnChange(count().key, false);
    expect(sentBreakpoints(fake)).toEqual(["frame1.count"]);
    await debug.inspection.breakOnChange(count().key, true);
    expect(sentBreakpoints(fake)).toEqual(["frame1.count", "frame0.count"]);
    await debug.inspection.selectFrame(1);
    expect(count().breaking).toBe(true);
    await stop(fake);
    expect(count().breaking).toBe(true);
  });

  it("drops the last stop's watch values at a stop with no frames", async () => {
    const { fake, game } = await begin(["gold"]);
    await stop(fake);
    expect(watchEntries(state(), ["gold"])[0]!.value).toBe("3");
    game.emptyStack();
    fake.event("stopped", { reason: "step", threadId: 0 });
    await vi.waitFor(() => expect(state().frames).toEqual([]));
    await settle();
    expect([state().status, state().frameId, state().variables]).toEqual(["paused", null, []]);
    expect(watchEntries(state(), ["gold"])).toEqual([{ key: "0", expression: "gold", value: undefined }]);
  });

  it("lets a scalar field of a story table be changed through the table's reference, but not the table row itself", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.toggle(key("Vars", "party"));
    const party = node("Vars", "party");
    const ada = party.children![0]!;
    expect([party.editable, ada.editable, ada.breakable]).toEqual([false, true, false]);
    await debug.inspection.setValue(ada.key, '"Grace"');
    expect(fake.requests.findLast((r) => r.command === "setVariable")!.arguments).toEqual({
      variablesReference: PARTY_REF,
      name: "1",
      value: '"Grace"',
    });
  });

  it("writes a field whose name holds a slash to its own table, not to a nested table's field of the same path", async () => {
    const { fake, debug, game } = await begin();
    game.bag();
    await stop(fake);
    await debug.inspection.toggle(key("Vars", "bag"));
    await debug.inspection.toggle(key("Vars", "bag", "a"));
    const slash = node("Vars", "bag", "a/b");
    const nested = node("Vars", "bag", "a", "b");
    expect(slash.key).not.toBe(nested.key);
    await debug.inspection.setValue(slash.key, "9");
    expect(fake.requests.findLast((r) => r.command === "setVariable")!.arguments).toEqual({
      variablesReference: BAG_REF,
      name: "a/b",
      value: "9",
    });
  });

  it("marks a story value's data breakpoint again when its folded scope is reopened at a later stop", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.breakOnChange(key("Vars", "gold"), true);
    await debug.inspection.toggle(key("Vars"));
    await stop(fake);
    await debug.inspection.toggle(key("Vars"));
    expect(node("Vars", "gold").breaking).toBe(true);
  });

  it("keeps the previous frame's values read-only while a selected frame's values load, and sends no write meanwhile", async () => {
    const { fake, debug, game } = await begin();
    game.local(1, "count", "1");
    game.local(0, "count", "5");
    await stop(fake);
    const countKey = key("Temps", "count");
    fake.holdWhen((r) => r.command === "scopes");
    const selecting = debug.inspection.selectFrame(0);
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    expect(node("Temps", "count").editable).toBe(false);
    await debug.inspection.setValue(countKey, "7");
    expect(fake.commands()).not.toContain("setVariable");
    fake.release();
    await selecting;
    expect([node("Temps", "count").value, node("Temps", "count").editable]).toEqual(["5", true]);
  });

  it("keeps both data breakpoints when the second is set before the first is answered", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    fake.holdWhen((r) => r.command === "dataBreakpointInfo");
    const first = debug.inspection.breakOnChange(key("Vars", "gold"), true);
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    const second = debug.inspection.breakOnChange(key("Vars", "mood"), true);
    fake.release();
    await first;
    await second;
    expect(sentBreakpoints(fake)).toEqual(["gold", "mood"]);
    expect(node("Vars").children!.filter((v) => v.breaking).map((v) => v.name)).toEqual(["gold", "mood"]);
  });

  it("drops a queued data breakpoint toggle when another frame is selected before it runs", async () => {
    const { fake, debug, game } = await begin();
    game.local(1, "count", "1");
    game.local(1, "bonus", "2");
    game.local(0, "bonus", "8");
    await stop(fake);
    fake.holdWhen((r) => r.command === "dataBreakpointInfo");
    const first = debug.inspection.breakOnChange(key("Temps", "count"), true);
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    const second = debug.inspection.breakOnChange(key("Temps", "bonus"), true);
    fake.holdWhen(() => false);
    await debug.inspection.selectFrame(0);
    fake.release();
    await first;
    await second;
    const sent = fake.requests
      .filter((r) => r.command === "setDataBreakpoints")
      .flatMap((r) => (r.arguments as { breakpoints: { dataId: string }[] }).breakpoints.map((b) => b.dataId));
    expect(sent).not.toContain("frame0.bonus");
  });

  it("keeps a data breakpoint the debugger accepted while another frame was being selected", async () => {
    const { fake, debug, game } = await begin();
    game.local(1, "count", "1");
    await stop(fake);
    fake.holdWhen((r) => r.command === "setDataBreakpoints");
    const setting = debug.inspection.breakOnChange(key("Temps", "count"), true);
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    fake.holdWhen(() => false);
    await debug.inspection.selectFrame(0);
    fake.release();
    await setting;
    await debug.inspection.selectFrame(1);
    expect(node("Temps", "count").breaking).toBe(true);
    await debug.inspection.breakOnChange(key("Vars", "gold"), true);
    expect(sentBreakpoints(fake)).toEqual(["frame1.count", "gold"]);
  });

  it("loads a scope opened while a stop's values were still loading", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.toggle(key("Vars"));
    fake.holdWhen((r) => r.command === "variables");
    fake.event("stopped", { reason: "step", threadId: 0 });
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    await debug.inspection.toggle(key("Vars"));
    fake.holdWhen(() => false);
    fake.release();
    await settle();
    await vi.waitFor(() =>
      expect(node("Vars").children?.map((v) => v.name)).toEqual(["gold", "mood", "party"]),
    );
  });

  it("shows a watch named __proto__ like any other name", async () => {
    const { fake } = await begin(["__proto__", "gold"]);
    await stop(fake);
    expect(watchEntries(state(), ["__proto__", "gold"])).toEqual([
      { key: "0", expression: "__proto__", error: "not available in this frame" },
      { key: "1", expression: "gold", value: "3" },
    ]);
  });

  it("keeps a watch added while a stop's watch values are still arriving", async () => {
    const { fake, debug } = await begin(["gold"]);
    await stop(fake);
    fake.hold("gold");
    fake.event("stopped", { reason: "step", threadId: 0 });
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    await debug.inspection.addWatch("mood");
    expect(watchEntries(state(), ["gold", "mood"])[1]!.value).toBe('"calm"');
    fake.release();
    await settle();
    expect(watchEntries(state(), ["gold", "mood"])).toEqual([
      { key: "0", expression: "gold", value: "3" },
      { key: "1", expression: "mood", value: '"calm"' },
    ]);
  });

  it("shows a watched name the frame does not hold as not available, not as an undefined value", async () => {
    const { fake } = await begin(["silver"]);
    await stop(fake);
    expect(watchEntries(state(), ["silver"])).toEqual([
      { key: "0", expression: "silver", error: "not available in this frame" },
    ]);
  });

  it("adds, changes and removes watch expressions in the project's store, evaluating them while paused", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.addWatch("mood");
    expect(saved.at(-1)).toEqual(["mood"]);
    expect(workspace.current.debug.watch).toEqual(["mood"]);
    expect(watchEntries(state(), ["mood"])[0]!.value).toBe("\"calm\"");
    debug.inspection.editWatch(0);
    expect(state().watchEditing).toBe(0);
    await debug.inspection.changeWatch(0, "gold");
    expect(workspace.current.debug.watch).toEqual(["gold"]);
    expect(state().watchEditing).toBeNull();
    expect(watchEntries(state(), ["gold"])[0]!.value).toBe("3");
    debug.inspection.removeWatch(0);
    expect(workspace.current.debug.watch).toEqual([]);
  });

  it("forgets the stop's values when the story continues and lists watches without values", async () => {
    const { fake } = await begin(["gold"]);
    await stop(fake);
    fake.event("continued", { threadId: 0, allThreadsContinued: true });
    expect(state().status).toBe("running");
    expect([state().frames, state().variables, state().watch.size]).toEqual([[], [], 0]);
    expect(watchEntries(state(), ["gold"])).toEqual([{ key: "0", expression: "gold", value: undefined }]);
  });

  it("answers a hover through the same evaluate path, in the selected frame", async () => {
    const { fake, debug } = await begin();
    expect(await debug.evaluate("gold")).toBeNull();
    await stop(fake);
    await debug.inspection.selectFrame(0);
    expect(await debug.evaluate("coin")).toBe("9");
    expect(fake.requests.at(-1)).toMatchObject({
      command: "evaluate",
      arguments: { expression: "coin", frameId: 0, context: "hover" },
    });
    expect(await debug.evaluate("nothing")).toBeNull();
  });

  it("keeps a data breakpoint the debugger accepted for an ended run out of the next run", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    fake.holdWhen((r) => r.command === "setDataBreakpoints");
    const toggling = debug.inspection.breakOnChange(key("Vars", "mood"), true);
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    fake.release();
    debug.end();
    await debug.start(MAIN);
    await toggling;
    await stop(fake);
    expect(node("Vars", "mood").breaking).toBe(false);
    await debug.inspection.breakOnChange(key("Vars", "gold"), true);
    expect(sentBreakpoints(fake)).toEqual(["gold"]);
  });

  it("makes the stop's rows read-only and sends nothing for them as soon as the next stop is announced", async () => {
    const { fake, debug } = await begin(["gold"]);
    await stop(fake);
    const goldKey = key("Vars", "gold");
    fake.holdWhen((r) => r.command === "stackTrace");
    fake.event("stopped", { reason: "step", threadId: 0 });
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    expect(node("Vars", "gold").editable).toBe(false);
    expect(node("Vars", "gold").breakable).toBe(false);
    const sent = fake.requests.length;
    await debug.inspection.setValue(goldKey, "5");
    await debug.inspection.breakOnChange(goldKey, true);
    await debug.inspection.selectFrame(0);
    expect(fake.requests.slice(sent).map((r) => r.command)).toEqual([]);
    fake.holdWhen(() => false);
    fake.release();
    await settle();
    expect([node("Vars", "gold").value, node("Vars", "gold").editable]).toEqual(["3", true]);
    expect(state().frameId).toBe(1);
  });

  it("settles a stop whose stack the debugger refuses as a stop with no frames, not the previous stop", async () => {
    const { fake, game } = await begin(["gold"]);
    await stop(fake);
    game.refuseStack();
    fake.event("stopped", { reason: "step", threadId: 0 });
    await settle();
    const now = state();
    expect([now.status, now.frameId, now.variables, now.frames]).toEqual(["paused", null, [], []]);
    expect(watchEntries(now, ["gold"])).toEqual([{ key: "0", expression: "gold", value: undefined }]);
  });

  describe("names an object would inherit, and names holding a slash or a dot", () => {
    const oddStory = async () => {
      const started = await begin(ODD_NAMES);
      ODD_NAMES.forEach((name, index) => started.game.set(name, String(100 + index)));
      await stop(started.fake);
      return started;
    };

    it("lists each as its own row with its own value and key", async () => {
      await oddStory();
      const rows = ODD_NAMES.map((name) => node("Vars", name));
      expect(rows.map((row) => row.value)).toEqual(["100", "101", "102", "103", "104"]);
      expect(new Set([...rows.map((row) => row.key), key("Vars", "gold"), key("Vars")]).size).toBe(7);
    });

    it.each(ODD_NAMES)("changes the value named %s through setVariable with that exact name", async (name) => {
      const { debug, fake } = await oddStory();
      await debug.inspection.setValue(key("Vars", name), "7");
      expect(fake.requests.findLast((r) => r.command === "setVariable")!.arguments).toEqual({
        variablesReference: VARS_REF,
        name,
        value: "7",
      });
      expect(node("Vars", name).value).toBe("7");
    });

    it.each(ODD_NAMES)("marks only the row named %s when its value breaks on change", async (name) => {
      const { debug, fake } = await oddStory();
      await debug.inspection.breakOnChange(key("Vars", name), true);
      expect(sentBreakpoints(fake)).toEqual([name]);
      expect(node("Vars").children!.filter((v) => v.breaking).map((v) => v.name)).toEqual([name]);
    });

    it("shows each as its own watch", async () => {
      await oddStory();
      expect(watchEntries(state(), ODD_NAMES).map((entry) => entry.value)).toEqual([
        "100",
        "101",
        "102",
        "103",
        "104",
      ]);
    });
  });
});

type Fake = ReturnType<typeof fakeAdapter>;
type Started = Awaited<ReturnType<typeof begin>>;

interface Pending {
  name: string;
  watch: string[];
  start: (started: Started) => Promise<unknown>;
  holds: (request: DebugProtocol.Request) => boolean;
}

const evaluates = (expression: string) => (request: DebugProtocol.Request) =>
  request.command === "evaluate" &&
  (request.arguments as { expression?: string }).expression === expression;

const PENDING: Pending[] = [
  {
    name: "loading the scopes of a stop",
    watch: ["gold"],
    holds: (request) => request.command === "scopes",
    start: async ({ fake }) => fake.event("stopped", { reason: "step", threadId: 0 }),
  },
  {
    name: "loading a table's variables",
    watch: ["gold"],
    holds: (request) =>
      request.command === "variables" &&
      (request.arguments as { variablesReference: number }).variablesReference === PARTY_REF,
    start: ({ debug }) => debug.inspection.toggle(key("Vars", "party")),
  },
  {
    name: "setting a variable",
    watch: ["gold"],
    holds: (request) => request.command === "setVariable",
    start: ({ debug }) => debug.inspection.setValue(key("Vars", "gold"), "50"),
  },
  {
    name: "toggling a data breakpoint",
    watch: ["gold"],
    holds: (request) => request.command === "dataBreakpointInfo",
    start: ({ debug }) => debug.inspection.breakOnChange(key("Vars", "mood"), true),
  },
  {
    name: "adding a watch",
    watch: ["gold"],
    holds: evaluates("mood"),
    start: ({ debug }) => debug.inspection.addWatch("mood"),
  },
  {
    name: "evaluating the watches of a stop",
    watch: ["gold", "mood"],
    holds: evaluates("mood"),
    start: async ({ fake }) => fake.event("stopped", { reason: "step", threadId: 0 }),
  },
];

interface Interruption {
  name: string;
  frameId: number | null;
  status: "paused" | "none";
  run: (started: Started) => Promise<void>;
}

const INTERRUPTIONS: Interruption[] = [
  {
    name: "a new stop",
    frameId: 1,
    status: "paused",
    run: async ({ fake }) => {
      fake.event("stopped", { reason: "step", threadId: 0 });
    },
  },
  {
    name: "a frame selection",
    frameId: 0,
    status: "paused",
    run: ({ debug }) => debug.inspection.selectFrame(0),
  },
  {
    name: "a stop with no frames",
    frameId: null,
    status: "paused",
    run: async ({ fake, game }) => {
      game.emptyStack();
      fake.event("stopped", { reason: "step", threadId: 0 });
    },
  },
  {
    name: "the run ending",
    frameId: null,
    status: "none",
    run: async ({ debug }) => debug.end(),
  },
];

const CASES = PENDING.flatMap((pending) =>
  INTERRUPTIONS.flatMap((interruption) =>
    (["before", "after"] as const).map((arrives) => ({ pending, interruption, arrives })),
  ),
);

const complete = (interruption: Interruption, expressions: readonly string[]) => {
  const now = state();
  expect(now.status).toBe(interruption.status);
  expect(now.frameId).toBe(interruption.frameId);
  if (interruption.frameId == null) {
    expect(now.variables).toEqual([]);
    expect(watchEntries(now, expressions).every((entry) => entry.value === undefined && !entry.error)).toBe(true);
    return;
  }
  const visit = (nodes: readonly DebugVariableNode[]) => {
    for (const row of nodes) {
      expect(row.message).toBeUndefined();
      if (row.expanded) {
        expect(row.children).toBeDefined();
        visit(row.children!);
      }
    }
  };
  visit(now.variables);
  expect(node("Vars", "gold").value).toBe("77");
  expect(node("Vars", "gold").editable).toBe(true);
  const own = interruption.frameId === 0 ? "coin=9" : "bag=2";
  expect(node("Temps").children!.map((v) => `${v.name}=${v.value}`)).toEqual([own]);
  for (const entry of watchEntries(now, expressions)) {
    expect(entry.value ?? entry.error).toBeDefined();
  }
  expect(watchEntries(now, ["gold"])[0]!.value).toBe("77");
};

describe("a response requested under one snapshot never changes another", () => {
  it(`covers ${PENDING.length} pending operations, ${INTERRUPTIONS.length} interruptions and both arrival orders`, () => {
    expect(CASES).toHaveLength(48);
  });

  it.each(CASES.map((c) => [c.pending.name, c.interruption.name, c.arrives, c] as const))(
    "%s, interrupted by %s, its response arriving %s",
    async (_pending, _interruption, _arrives, { pending, interruption, arrives }) => {
      const started = await begin(pending.watch);
      const { fake, game } = started;
      await stop(fake);
      const breakpointsBefore = fake.commands().filter((c) => c === "setDataBreakpoints").length;
      fake.holdWhen(pending.holds);
      const operation = pending.start(started);
      await vi.waitFor(() => expect(fake.held()).toBe(1));
      fake.holdWhen(() => false);
      if (arrives === "before") {
        fake.release();
        await operation;
        await settle();
      }
      game.set("gold", "77");
      await interruption.run(started);
      await settle();
      if (arrives === "after") {
        const published = state();
        const sent = fake.requests.length;
        fake.release();
        await operation;
        await settle();
        expect(state()).toBe(published);
        expect(fake.requests.length).toBe(sent);
      }
      complete(interruption, workspace.watchExpressions.value);
      const breakpoints = fake.commands().filter((c) => c === "setDataBreakpoints").length;
      if (pending.name === "toggling a data breakpoint") {
        expect(breakpoints - breakpointsBefore).toBe(arrives === "before" ? 1 : 0);
        if (interruption.frameId != null) {
          expect(node("Vars", "mood").breaking).toBe(arrives === "before");
        }
      } else {
        expect(breakpoints).toBe(breakpointsBefore);
      }
      started.debug.end();
    },
  );
});
