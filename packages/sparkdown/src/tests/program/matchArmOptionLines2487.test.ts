import { describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { MAIN_URI, compileScript } from "./programHarness";

const quiet = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const rootOf = (text: string): ProgramRoot => {
  const { program } = quiet(() => compileScript(text));
  if (!program.chunks) {
    throw new Error(`no chunks: ${JSON.stringify(program.diagnostics)}`);
  }
  return program.chunks;
};

const ARMS = `scene start
  choose
    Prompt.
    match "b"
      | a = * A
      | b = * B
    end
    * Outer
  end
end
`;

describe("the options a match's arms offer in a choose block's preamble (#2487)", () => {
  const root = rootOf(ARMS);

  it("locates each arm's option on the arm's own line", () => {
    for (const line of [4, 5, 7]) {
      const option = root.optionAt(MAIN_URI, line);
      expect(option, `line ${line}`).toBeDefined();
      expect(root.locationOf(option!)?.startLine).toBe(line);
    }
  });

  it("gives the scene's line the caption the choose line shows", () => {
    expect(root.addressAt(MAIN_URI, 0, { beat: "last" })).toBe(
      root.addressAt(MAIN_URI, 1, { beat: "last" }),
    );
    expect(
      root.locationOf(root.addressAt(MAIN_URI, 0, { beat: "last" })!)?.startLine,
    ).toBe(2);
  });
});
