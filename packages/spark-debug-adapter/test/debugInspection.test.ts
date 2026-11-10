import { describe, expect, it } from "vitest";

import { SparkDebugSession } from "../src/SparkDebugSession";

const location = (line: number) => ({
  uri: "file:///main.sd",
  range: { start: { line, character: 0 }, end: { line, character: 4 } },
});

const session = (refuse?: string) => {
  const sent: { method: string; params: any }[] = [];
  const responses: any[] = [];
  const connection = {
    connectInput() {},
    emit: async (message: { method: string; params: any }) => {
      sent.push(message);
      if (message.method === "game/stackTrace") {
        return {
          stackFrames: [
            { id: 1, name: "shop", location: location(10) },
            { id: 0, name: "start", location: location(5) },
          ],
          totalFrames: 2,
        };
      }
      if (message.method === "game/setVariable") {
        if (refuse) {
          throw { code: 1, message: refuse };
        }
        return {
          variable: {
            name: message.params.name,
            value: "10",
            type: "number",
            variablesReference: 0,
          },
        };
      }
      if (message.method === "game/evaluationContext") {
        return { context: { gold: 3 } };
      }
      if (message.method === "game/variables") {
        return { variables: [{ name: "", value: "3", variablesReference: 0 }] };
      }
      return {};
    },
  };
  const s = new SparkDebugSession(
    {
      isWindows: false,
      uriToPath: (uri: string) => uri.replace("file://", ""),
      pathToUri: (path: string) => `file://${path}`,
      getRootPath: () => undefined,
    } as any,
    connection as any,
    { syncCursorToExecution: false },
  );
  (s as any).sendResponse = (response: any) => responses.push(response);
  (s as any).sendEvent = () => {};
  const call = async (name: string, args: object) => {
    await (s as any)[name]({ success: true, body: {} }, args);
    return responses.at(-1)!;
  };
  const scope = async (name: string, frame = 0) => {
    const { body } = await call("stackTraceRequest", { threadId: 0 });
    const { body: scopes } = await call("scopesRequest", {
      frameId: body.stackFrames[frame].id,
    });
    return scopes.scopes.find((c: { name: string }) => c.name === name);
  };
  const setSent = () =>
    sent.filter((m) => m.method === "game/setVariable").map((m) => m.params);
  const variablesSent = () =>
    sent.filter((m) => m.method === "game/variables").map((m) => m.params);
  return { call, scope, setSent, variablesSent };
};

describe("the debug adapter's inspection requests", () => {
  it("says it can change values", async () => {
    const s = session();
    const response = await s.call("initializeRequest", {});
    expect(response.body.supportsSetVariable).toBe(true);
  });

  it("marks Temps as the frame's locals so a client can list story values first", async () => {
    const s = session();
    expect((await s.scope("Temps")).presentationHint).toBe("locals");
    expect((await s.scope("Vars")).presentationHint).toBeUndefined();
  });

  it("reads the engine's own values from a Builtins scope that is expensive, apart from the story's Vars", async () => {
    const s = session();
    const builtins = await s.scope("Builtins");
    expect(builtins.expensive).toBe(true);
    expect((await s.scope("Vars")).expensive).toBe(false);
    await s.call("variablesRequest", { variablesReference: builtins.variablesReference });
    expect(s.variablesSent().at(-1)).toEqual({ scope: "builtins" });
    const response = await s.call("setVariableRequest", {
      variablesReference: builtins.variablesReference,
      name: "config",
      value: "1",
    });
    expect(response.success).toBe(false);
  });

  it("changes a story value through the player and answers with its new value", async () => {
    const s = session();
    const vars = await s.scope("Vars");
    const response = await s.call("setVariableRequest", {
      variablesReference: vars.variablesReference,
      name: "gold",
      value: "10",
    });
    expect(s.setSent()).toEqual([{ scope: "vars", name: "gold", value: "10" }]);
    expect(response.success).toBe(true);
    expect(response.body).toMatchObject({ value: "10", variablesReference: 0 });
  });

  it("changes a local value of the frame its scope came from", async () => {
    const s = session();
    const temps = await s.scope("Temps", 1);
    await s.call("setVariableRequest", {
      variablesReference: temps.variablesReference,
      name: "bag",
      value: "5",
    });
    expect(s.setSent()).toEqual([
      { scope: "temps", name: "bag", value: "5", threadId: 0, frameId: 0 },
    ]);
  });

  it("answers with the player's message when the player refuses the value", async () => {
    const s = session("Expected a value.");
    const vars = await s.scope("Vars");
    const response = await s.call("setVariableRequest", {
      variablesReference: vars.variablesReference,
      name: "gold",
      value: "",
    });
    expect(response.success).toBe(false);
    expect(response.message).toBe("Expected a value.");
  });

  it("refuses to change a value outside the story and local scopes", async () => {
    const s = session();
    const defines = await s.scope("Defines");
    const response = await s.call("setVariableRequest", {
      variablesReference: defines.variablesReference,
      name: "character",
      value: "1",
    });
    expect(s.setSent()).toEqual([]);
    expect(response.success).toBe(false);
    expect(response.message).toBe("Only story and local values can be changed.");
  });

  it("answers a watch on a name the frame does not hold with an error, not a value", async () => {
    const s = session();
    const { body } = await s.call("stackTraceRequest", { threadId: 0 });
    const missing = await s.call("evaluateRequest", {
      expression: "silver",
      frameId: body.stackFrames[0].id,
      context: "watch",
    });
    expect(missing.success).toBe(false);
    expect(missing.message).toBe("not available in this frame");
    const held = await s.call("evaluateRequest", {
      expression: "gold",
      frameId: body.stackFrames[0].id,
      context: "watch",
    });
    expect(held.success).toBe(true);
    expect(held.body.result).toBe("3");
  });
});
