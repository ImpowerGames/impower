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
  expect(large.ms).toBeLessThan(small.ms * 24);
}, 300_000);
