import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { ContinueGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ContinueGameMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameEvaluationContextMessage";
import { GetGameStackTraceMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameVariablesMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameBreakpointsMessage";
import { SetGameDataBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameDataBreakpointsMessage";
import { SetGameFunctionBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameFunctionBreakpointsMessage";
import { StepGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store mood = 0

-> start

scene start
  HERO:
    The first line.
  & mood = 1
  HERO:
    The second line.
  & mood = mood + 1
  HERO:
    The third line.
  HERO:
    The fourth line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const DECLARE = lineOf("store mood = 0");
const WRITE = lineOf("& mood = 1");
const WRITE_AGAIN = lineOf("& mood = mood + 1");
const FIRST = lineOf("The first line.");
const SECOND = lineOf("The second line.");
const THIRD = lineOf("The third line.");

const standing = (asked: any) => ({
  line: asked.stack.result.stackFrames[0]?.location?.range.start.line,
  mood: asked.context.result.context.mood,
});

const answer = (response: any) =>
  "error" in response ? { error: response.error } : { result: response.result };

const debugSession = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: FIRST },
    manualClock: true,
  });
  const c = h.controller;
  try {
    await h.compile();
    await h.select(FIRST);
    await settle(40);
    const answers: any = {};
    answers.enable = answer(
      await c.handleEnableGameDebug(EnableGameDebugMessage.type.request({})),
    );
    expect(await c.startGameAndApp()).toBe(true);
    await settle(40);
    await h.tick(1000 / 60, 60);

    answers.setBreakpoints = answer(
      await c.handleSetGameBreakpoints(
        SetGameBreakpointsMessage.type.request({
          breakpoints: [{ file: MAIN_URI, line: SECOND }],
        }),
      ),
    );
    answers.setFunctionBreakpoints = answer(
      await c.handleSetGameFunctionBreakpoints(
        SetGameFunctionBreakpointsMessage.type.request({
          functionBreakpoints: [{ name: "greet" }],
        }),
      ),
    );
    answers.setDataBreakpoints = answer(
      await c.handleSetGameDataBreakpoints(
        SetGameDataBreakpointsMessage.type.request({
          dataBreakpoints: [{ dataId: "mood" }],
        }),
      ),
    );

    c._app.emit(EventMessage.type.notification({ type: "pointerdown", button: 0 } as never));
    await settle(10);
    await h.tick(1000 / 60, 60);

    const ask = async () => {
      const threads = answer(
        await c.handleGetGameThreads(GetGameThreadsMessage.type.request({})),
      );
      const threadId = (threads as any).result?.threads?.[0]?.id ?? 0;
      const stack = answer(
        await c.handleGetGameStackTrace(
          GetGameStackTraceMessage.type.request({ threadId, startFrame: 0, levels: 20 }),
        ),
      );
      const context = answer(
        await c.handleGetGameEvaluationContext(
          GetGameEvaluationContextMessage.type.request({}),
        ),
      );
      const variables: any = {};
      for (const scope of ["vars", "temps", "defines"] as const) {
        variables[scope] = answer(
          await c.handleGetGameVariables(GetGameVariablesMessage.type.request({ scope })),
        );
      }
      const withChildren = ((variables.defines as any).result?.variables ?? []).find(
        (v: any) => v.variablesReference > 0,
      );
      variables.children = answer(
        await c.handleGetGameVariables(
          GetGameVariablesMessage.type.request({
            scope: "children",
            variablesReference: withChildren?.variablesReference ?? 0,
          }),
        ),
      );
      variables.value = answer(
        await c.handleGetGameVariables(
          GetGameVariablesMessage.type.request({ scope: "value", value: { a: [1, "b"] } }),
        ),
      );
      return { threads, stack, context, variables };
    };

    answers.stopped = await ask();
    answers.stepOver = answer(
      await c.handleStepGame(StepGameMessage.type.request({ traversal: "over" })),
    );
    await settle(10);
    answers.afterStepOver = await ask();
    answers.stepIn = answer(
      await c.handleStepGame(StepGameMessage.type.request({ traversal: "in" })),
    );
    await settle(10);
    answers.afterStepIn = await ask();
    answers.stepOut = answer(
      await c.handleStepGame(StepGameMessage.type.request({ traversal: "out" })),
    );
    await settle(10);
    answers.afterStepOut = await ask();
    answers.continue = answer(
      await c.handleContinueGame(ContinueGameMessage.type.request({})),
    );
    await settle(10);
    answers.afterContinue = await ask();
    answers.reported = h.toEditor
      .filter((m) => /^game\/(hitBreakpoint|stepped|started|finished)/.test(m.method))
      .map((m) => ({ method: m.method, params: m.params }));
    await c.destroyGameAndApp();
    return answers;
  } finally {
    h.dispose();
  }
};

describe("the debugger during PLAY", () => {
  it("answers each request from the worker", async () => {
    const on = await debugSession();

    const asked = [
      "stopped",
      "afterStepOver",
      "afterStepIn",
      "afterStepOut",
      "afterContinue",
    ];
    const answers: [string, any][] = [];
    for (const [key, value] of Object.entries(on)) {
      if (asked.includes(key)) {
        const { threads, stack, context, variables } = value as any;
        answers.push([`${key} threads`, threads], [`${key} stack`, stack], [`${key} context`, context]);
        for (const [scope, variable] of Object.entries(variables)) {
          answers.push([`${key} ${scope}`, variable]);
        }
      } else if (key !== "reported") {
        answers.push([key, value]);
      }
    }
    for (const [key, value] of answers) {
      expect({ [key]: "error" in value ? value.error : "answered" }).toEqual({ [key]: "answered" });
    }
    for (const key of asked) {
      expect(on[key].threads.result.threads).toHaveLength(1);
    }
    expect(on.setBreakpoints.result.breakpoints).toHaveLength(1);
    expect(on.setBreakpoints.result.breakpoints[0].verified).toBe(true);
    expect(on.setBreakpoints.result.breakpoints[0].location.range.start.line).toBe(SECOND);
    expect(on.setFunctionBreakpoints.result.functionBreakpoints).toHaveLength(1);
    expect(on.setFunctionBreakpoints.result.functionBreakpoints[0].verified).toBe(false);
    expect(on.setDataBreakpoints.result.dataBreakpoints).toHaveLength(1);
    expect(on.setDataBreakpoints.result.dataBreakpoints[0].verified).toBe(true);
    expect(on.setDataBreakpoints.result.dataBreakpoints[0].location.range.start.line).toBe(DECLARE);
    expect(on.stepIn.result.done).toBe(true);
    expect(on.stepOut.result.done).toBe(true);
    const mood = (key: string) =>
      on[key].variables.vars.result.variables.find((v: any) => v.name === "mood")?.value;
    expect(mood("stopped")).toBe("1");
    expect(mood("afterStepOut")).toBe("2");

    expect(standing(on.stopped)).toEqual({ line: WRITE, mood: 1 });
    expect(on.stopped.variables.vars.result.variables.length).toBeGreaterThan(0);
    expect(standing(on.afterStepOver)).toEqual({ line: SECOND, mood: 1 });
    expect(standing(on.afterStepIn)).toEqual({ line: SECOND, mood: 1 });
    expect(standing(on.afterStepOut)).toEqual({ line: WRITE_AGAIN, mood: 2 });
    expect(standing(on.afterContinue)).toEqual({ line: THIRD, mood: 2 });
    expect(on.stepOver.result.done).toBe(true);
    expect(on.continue.result.done).toBe(true);
    expect(
      (on.reported as any[]).map((m) => [m.method, m.params.location?.range.start.line]),
    ).toEqual([
      ["game/hitBreakpoint", WRITE],
      ["game/hitBreakpoint", SECOND],
      ["game/stepped", SECOND],
      ["game/hitBreakpoint", WRITE_AGAIN],
    ]);
  }, 120_000);
});
