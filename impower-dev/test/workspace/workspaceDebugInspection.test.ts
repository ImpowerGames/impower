import type { DebugProtocol } from "@vscode/debugprotocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceDebugClient, {
  type DebugAdapter,
} from "../../src/modules/spark-editor/workspace/WorkspaceDebugClient";
import {
  frameEntries,
  variableTree,
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

const story = () => {
  const values: Record<string, string> = { gold: "3", mood: "\"calm\"" };
  const temps: Record<number, Record<string, string>> = { 1: { bag: "2" }, 0: { coin: "9" } };
  let refuseSet: string | null = null;
  let noData = false;
  let names = ["shop", "start"];
  let empty = false;
  let withBag = false;
  const answer = (request: DebugProtocol.Request): Answer => {
    const args = request.arguments as Record<string, any>;
    switch (request.command) {
      case "stackTrace":
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
                ...Object.entries(values).map(([name, value]) => ({ name, value, variablesReference: 0 })),
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
            variables: Object.entries(temps[frame] ?? {}).map(([name, value]) => ({ name, value, variablesReference: 0 })),
          },
        };
      }
      case "evaluate": {
        const value = values[args.expression] ?? temps[args.frameId]?.[args.expression];
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
        values[args.name] = args.value;
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
    refuseSet: (message: string | null) => {
      refuseSet = message;
    },
    noData: () => {
      noData = true;
    },
    local: (frame: number, name: string, value: string) => {
      temps[frame]![name] = value;
    },
    name: (inner: string, outer: string) => {
      names = [inner, outer];
    },
    emptyStack: () => {
      empty = true;
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
  let holding: string | null = null;
  const held: (() => void)[] = [];
  const adapter: DebugAdapter = {
    handleMessage(message) {
      const request = message as DebugProtocol.Request;
      requests.push(request);
      const reply = () =>
        send({
          seq: ++seq,
          type: "response",
          request_seq: request.seq,
          command: request.command,
          success: true,
          ...answer(request),
        } as DebugProtocol.Response);
      const args = request.arguments as { expression?: string };
      if (request.command === "evaluate" && args.expression === holding) {
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
      holding = expression;
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

const stop = async (fake: ReturnType<typeof fakeAdapter>) => {
  fake.event("stopped", { reason: "step", threadId: 0 });
  await vi.waitFor(() => expect(workspace.debugInspection.value.status).toBe("paused"));
  await vi.waitFor(() => expect(fake.commands().at(-1)).not.toBe("scopes"));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const tree = () =>
  variableTree(workspace.debugInspection.value).map((scope) => ({
    name: scope.name,
    expanded: scope.expanded,
    children: scope.children?.map((v) => `${v.name}=${v.value}`),
  }));

beforeEach(() => {
  saved.length = 0;
});

afterEach(() => {
  ending?.end();
  ending = undefined;
  workspace.debugInspection.value = { ...workspace.debugInspection.value, expanded: {} };
});

describe("the web editor's Variables, Watch and Call stack inspection", () => {
  it("knows no run before a start and a running story after it", async () => {
    expect(workspace.debugInspection.value.status).toBe("none");
    await begin();
    expect(workspace.debugInspection.value.status).toBe("running");
    ending!.end();
    expect(workspace.debugInspection.value.status).toBe("none");
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
    expect(watchEntries(workspace.debugInspection.value, workspace.watchExpressions.value)).toEqual([
      { key: "0", expression: "gold", value: "3" },
      { key: "1", expression: "silver", error: "not available in this frame" },
    ]);
    expect(frameEntries(workspace.debugInspection.value)).toEqual([
      { id: 1, name: "shop", location: "main.sd:12", inProject: true, selected: true },
      { id: 0, name: "start", location: "main.sd:4", inProject: true, selected: false },
    ]);
  });

  it("lets a cheap scope's direct values be watched for changes and its scalar values, inside tables too, be edited", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.toggle("scope:Vars/party");
    const [vars] = variableTree(workspace.debugInspection.value);
    const gold = vars!.children!.find((v) => v.name === "gold")!;
    const party = vars!.children!.find((v) => v.name === "party")!;
    expect([gold.editable, gold.breakable]).toEqual([true, true]);
    expect([party.editable, party.expandable, party.expanded]).toEqual([false, true, true]);
    expect(party.children!.map((v) => [v.name, v.editable, v.breakable])).toEqual([["1", true, false]]);
  });

  it("keeps a branch open across stops and loads it again at the next stop", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.toggle("scope:Vars/party");
    await stop(fake);
    expect(fake.commands().filter((c) => c === "variables").length).toBeGreaterThanOrEqual(5);
    const [vars] = variableTree(workspace.debugInspection.value);
    expect(vars!.children!.find((v) => v.name === "party")!.children!.map((v) => v.value)).toEqual(["\"Ada\""]);
  });

  it("selects a caller frame and reads that frame's locals and watches", async () => {
    const { fake, debug } = await begin(["coin"]);
    await stop(fake);
    await debug.inspection.selectFrame(0);
    expect(fake.requests.findLast((r) => r.command === "scopes")!.arguments).toEqual({ frameId: 0 });
    expect(tree()[1]).toEqual({ name: "Temps", expanded: true, children: ["coin=9"] });
    expect(watchEntries(workspace.debugInspection.value, ["coin"])).toEqual([
      { key: "0", expression: "coin", value: "9" },
    ]);
    expect(frameEntries(workspace.debugInspection.value).map((f) => f.selected)).toEqual([false, true]);
  });

  it("changes a value through setVariable and shows the new value and the watches that read it", async () => {
    const { fake, debug } = await begin(["gold"]);
    await stop(fake);
    debug.inspection.edit("scope:Vars/gold");
    expect(workspace.debugInspection.value.editing).toBe("scope:Vars/gold");
    await debug.inspection.setValue("scope:Vars/gold", "12");
    expect(fake.requests.find((r) => r.command === "setVariable")!.arguments).toEqual({
      variablesReference: VARS_REF,
      name: "gold",
      value: "12",
    });
    expect(workspace.debugInspection.value.editing).toBeNull();
    expect(tree()[0]!.children![0]).toBe("gold=12");
    expect(watchEntries(workspace.debugInspection.value, ["gold"])[0]!.value).toBe("12");
  });

  it("keeps the old value and shows the adapter's message under the row when setVariable is refused", async () => {
    const { fake, debug, game } = await begin();
    await stop(fake);
    game.refuseSet("Expected a value.");
    await debug.inspection.setValue("scope:Vars/gold", "ten");
    const gold = variableTree(workspace.debugInspection.value)[0]!.children![0]!;
    expect([gold.value, gold.message]).toEqual(["3", "Expected a value."]);
    debug.inspection.edit("scope:Vars/gold");
    expect(variableTree(workspace.debugInspection.value)[0]!.children![0]!.message).toBeUndefined();
  });

  it("sets and clears a data breakpoint through dataBreakpointInfo and setDataBreakpoints, marking the row", async () => {
    const { fake, debug, game } = await begin();
    await stop(fake);
    await debug.inspection.breakOnChange("scope:Vars/gold", true);
    expect(fake.requests.find((r) => r.command === "dataBreakpointInfo")!.arguments).toEqual({
      variablesReference: VARS_REF,
      name: "gold",
    });
    expect(fake.requests.findLast((r) => r.command === "setDataBreakpoints")!.arguments).toEqual({
      breakpoints: [{ dataId: "gold", accessType: "write" }],
    });
    expect(variableTree(workspace.debugInspection.value)[0]!.children![0]!.breaking).toBe(true);
    await debug.inspection.breakOnChange("scope:Vars/gold", false);
    expect(fake.requests.findLast((r) => r.command === "setDataBreakpoints")!.arguments).toEqual({
      breakpoints: [],
    });
    expect(variableTree(workspace.debugInspection.value)[0]!.children![0]!.breaking).toBe(false);
    game.noData();
    await debug.inspection.breakOnChange("scope:Vars/mood", true);
    const mood = variableTree(workspace.debugInspection.value)[0]!.children![1]!;
    expect([mood.breaking, mood.message]).toEqual([false, "Value will never change"]);
  });

  it("keeps Break when value changes on a local to the frame it was set in, apart from a caller's local of the same name", async () => {
    const { fake, debug, game } = await begin();
    game.local(1, "count", "1");
    game.local(0, "count", "5");
    await stop(fake);
    const count = () =>
      variableTree(workspace.debugInspection.value)[1]!.children!.find((v) => v.name === "count")!;
    const sent = () => fake.requests.findLast((r) => r.command === "setDataBreakpoints")!.arguments;
    await debug.inspection.breakOnChange("scope:Temps/count", true);
    expect(sent()).toEqual({ breakpoints: [{ dataId: "frame1.count", accessType: "write" }] });
    expect(count().breaking).toBe(true);
    await debug.inspection.selectFrame(0);
    expect([count().value, count().breaking]).toEqual(["5", false]);
    await debug.inspection.breakOnChange("scope:Temps/count", true);
    expect(sent()).toEqual({
      breakpoints: [
        { dataId: "frame1.count", accessType: "write" },
        { dataId: "frame0.count", accessType: "write" },
      ],
    });
    await debug.inspection.selectFrame(1);
    expect([count().value, count().breaking]).toEqual(["1", true]);
    await debug.inspection.breakOnChange("scope:Temps/count", false);
    expect(sent()).toEqual({ breakpoints: [{ dataId: "frame0.count", accessType: "write" }] });
    await debug.inspection.selectFrame(0);
    expect(count().breaking).toBe(true);
  });

  it("tells apart two frames with the same name by the debugger's data ID of each local", async () => {
    const { fake, debug, game } = await begin();
    game.name("<anonymous>", "<anonymous>");
    game.local(1, "count", "1");
    game.local(0, "count", "5");
    await stop(fake);
    const count = () =>
      variableTree(workspace.debugInspection.value)[1]!.children!.find((v) => v.name === "count")!;
    const sent = () => fake.requests.findLast((r) => r.command === "setDataBreakpoints")!.arguments;
    await debug.inspection.breakOnChange("scope:Temps/count", true);
    expect(count().breaking).toBe(true);
    await debug.inspection.selectFrame(0);
    expect([count().value, count().breaking]).toEqual(["5", false]);
    await debug.inspection.breakOnChange("scope:Temps/count", false);
    expect(sent()).toEqual({ breakpoints: [{ dataId: "frame1.count", accessType: "write" }] });
    await debug.inspection.breakOnChange("scope:Temps/count", true);
    expect(sent()).toEqual({
      breakpoints: [
        { dataId: "frame1.count", accessType: "write" },
        { dataId: "frame0.count", accessType: "write" },
      ],
    });
    await debug.inspection.selectFrame(1);
    expect(count().breaking).toBe(true);
    await stop(fake);
    expect(count().breaking).toBe(true);
  });

  it("drops the last stop's watch values at a stop with no frames", async () => {
    const { fake, game } = await begin(["gold"]);
    await stop(fake);
    expect(watchEntries(workspace.debugInspection.value, ["gold"])[0]!.value).toBe("3");
    game.emptyStack();
    fake.event("stopped", { reason: "step", threadId: 0 });
    await vi.waitFor(() => expect(workspace.debugInspection.value.frames).toEqual([]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const state = workspace.debugInspection.value;
    expect([state.status, state.frameId, state.scopes]).toEqual(["paused", null, []]);
    expect(watchEntries(state, ["gold"])).toEqual([{ key: "0", expression: "gold", value: undefined }]);
  });

  it("lets a scalar field of a story table be changed through the table's reference, but not the table row itself", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.toggle("scope:Vars/party");
    const party = variableTree(workspace.debugInspection.value)[0]!.children!.find((v) => v.name === "party")!;
    const ada = party.children![0]!;
    expect([party.editable, ada.editable, ada.breakable]).toEqual([false, true, false]);
    await debug.inspection.setValue("scope:Vars/party/1", '"Grace"');
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
    const bagKey = variableTree(workspace.debugInspection.value)[0]!.children!.find((v) => v.name === "bag")!.key;
    await debug.inspection.toggle(bagKey);
    const bag = () => variableTree(workspace.debugInspection.value)[0]!.children!.find((v) => v.name === "bag")!;
    await debug.inspection.toggle(bag().children!.find((v) => v.name === "a")!.key);
    const slash = bag().children!.find((v) => v.name === "a/b")!;
    const nested = bag().children!.find((v) => v.name === "a")!.children!.find((v) => v.name === "b")!;
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
    await debug.inspection.breakOnChange("scope:Vars/gold", true);
    await debug.inspection.toggle("scope:Vars");
    await stop(fake);
    await debug.inspection.toggle("scope:Vars");
    const gold = variableTree(workspace.debugInspection.value)[0]!.children!.find((v) => v.name === "gold")!;
    expect(gold.breaking).toBe(true);
  });

  it("keeps a watch added while a stop's watch values are still arriving", async () => {
    const { fake, debug } = await begin(["gold"]);
    await stop(fake);
    fake.hold("gold");
    fake.event("stopped", { reason: "step", threadId: 0 });
    await vi.waitFor(() => expect(fake.held()).toBe(1));
    await debug.inspection.addWatch("mood");
    expect(watchEntries(workspace.debugInspection.value, ["gold", "mood"])[1]!.value).toBe('"calm"');
    fake.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(watchEntries(workspace.debugInspection.value, ["gold", "mood"])).toEqual([
      { key: "0", expression: "gold", value: "3" },
      { key: "1", expression: "mood", value: '"calm"' },
    ]);
  });

  it("shows a watched name the frame does not hold as not available, not as an undefined value", async () => {
    const { fake } = await begin(["silver"]);
    await stop(fake);
    expect(watchEntries(workspace.debugInspection.value, ["silver"])).toEqual([
      { key: "0", expression: "silver", error: "not available in this frame" },
    ]);
  });

  it("adds, changes and removes watch expressions in the project's store, evaluating them while paused", async () => {
    const { fake, debug } = await begin();
    await stop(fake);
    await debug.inspection.addWatch("mood");
    expect(saved.at(-1)).toEqual(["mood"]);
    expect(workspace.current.debug.watch).toEqual(["mood"]);
    expect(watchEntries(workspace.debugInspection.value, ["mood"])[0]!.value).toBe("\"calm\"");
    debug.inspection.editWatch(0);
    expect(workspace.debugInspection.value.watchEditing).toBe(0);
    await debug.inspection.changeWatch(0, "gold");
    expect(workspace.current.debug.watch).toEqual(["gold"]);
    expect(workspace.debugInspection.value.watchEditing).toBeNull();
    expect(watchEntries(workspace.debugInspection.value, ["gold"])[0]!.value).toBe("3");
    debug.inspection.removeWatch(0);
    expect(workspace.current.debug.watch).toEqual([]);
  });

  it("forgets the stop's values when the story continues and lists watches without values", async () => {
    const { fake } = await begin(["gold"]);
    await stop(fake);
    fake.event("continued", { threadId: 0, allThreadsContinued: true });
    const state = workspace.debugInspection.value;
    expect(state.status).toBe("running");
    expect([state.frames, state.scopes, state.watch]).toEqual([[], [], {}]);
    expect(watchEntries(state, ["gold"])).toEqual([{ key: "0", expression: "gold", value: undefined }]);
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
});
