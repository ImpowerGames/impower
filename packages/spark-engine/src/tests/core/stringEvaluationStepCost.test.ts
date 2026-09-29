// #1134 — a loop inside a string interpolation must cost the same per step
// however long it has run.
//
// While an interpolation is evaluated, the engine asks on every output push
// whether it is inside a string evaluation. Answering that by walking the
// output stream back to the `BeginString` made each step cost as much as the
// stream was long, and a runaway loop inside `{...}` slowed down quadratically
// instead of reaching the step ceiling and being reported as a possible
// infinite loop. (The statement-chunk engine does not yet run a function call
// inside an interpolation; its state is covered by sparkdown's
// `programStringEvaluation.test.ts`.)

import { expect, test } from "vitest";
import { compileProgram } from "../harness/compileProgram";
import { Game } from "../../game/core/classes/Game";

const SRC = `function spin()
  local n = 0
  while true do
    n = n + 1
  end
  return n
end

BOB:
  Before the loop.

BOB:
  Spinning {spin()}.
`;

const program = compileProgram(SRC);

const runToCeiling = (limit: number) => {
  const game = new Game({
    program,
    now: () => performance.now(),
    executionStepLimit: limit,
    setTimeout: (h: Function) => {
      h();
      return 0;
    },
  } as never);
  const errors: string[] = [];
  game.connection.outgoing.addListener("*", (m: any) => {
    if (m.method === "game/runtimeError") errors.push(m.params?.message);
  });
  game.start();
  const t0 = performance.now();
  game.clickedToContinue();
  return { ms: performance.now() - t0, errors };
};

test("a loop inside a string interpolation reaches the step ceiling in linear time", () => {
  // Warm the engine up so the first measured run does not pay for JIT.
  runToCeiling(10_000);
  const small = runToCeiling(10_000);
  const large = runToCeiling(80_000);
  console.log("10k steps ms", small.ms, "80k steps ms", large.ms);
  expect(small.errors).toEqual([
    "Execution exceeded 10000 steps: possible infinite loop",
  ]);
  expect(large.errors).toEqual([
    "Execution exceeded 80000 steps: possible infinite loop",
  ]);
  // Linear cost makes 8x the steps take about 8x as long; a per-step cost
  // that grows with the stream makes it take about 64x as long.
  expect(large.ms).toBeLessThan(small.ms * 24);
}, 300_000);
