// The editor's debugger talks to the player, which answers from PLAY's game:
// the page's own with the switch off, and with it on the one in the worker,
// to which the player forwards each request (#682). For the same program in
// the same state, every answer is the one the page's game gives.
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
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first line.");
const SECOND = lineOf("The second line.");

/** The answer a handler gave, without the id of the request it answered. */
const answer = (response: any) =>
  "error" in response ? { error: response.error } : { result: response.result };

/** PLAY from the first line with the debugger on and a breakpoint on the
 *  second, advanced by a click, then every request the debugger makes. */
const debugSession = async (workerDisplays: boolean) => {
  const h = await createPlayerHarness({
    workerDisplays,
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

    // The player clicks to advance, and the game runs on toward the second
    // line.
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
      for (const scope of ["vars", "temps", "lists", "defines"] as const) {
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
    answers.continue = answer(
      await c.handleContinueGame(ContinueGameMessage.type.request({})),
    );
    await settle(10);
    answers.afterContinue = await ask();
    // What the game told the editor along the way: where it stopped, and
    // what it stepped through.
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
  it("answers each request from the worker as the page's game does", async () => {
    const off = await debugSession(false);
    const on = await debugSession(true);

    // The session stopped somewhere and has something to show, so the
    // comparison below compares answers that say something.
    const stopped = off.stopped as any;
    expect(stopped.stack.result.stackFrames.length).toBeGreaterThan(0);
    expect(stopped.variables.vars.result.variables.length).toBeGreaterThan(0);
    expect((off.reported as any[]).map((m) => m.method)).toContain("game/hitBreakpoint");
    // The expression context holds the story's variable, which the Debug
    // Console evaluates by name.
    expect(typeof stopped.context.result.context.mood).toBe("number");

    for (const key of Object.keys(off)) {
      expect({ [key]: on[key] }).toEqual({ [key]: off[key] });
    }
  }, 120_000);
});
