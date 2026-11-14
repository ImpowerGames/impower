import { describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { chunkOfAddress, offsetOfAddress } from "../../program/ProgramChunk";
import { MAIN_URI, compileScript, programSession } from "./programHarness";

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

const CAPTION = `scene start
  choose
    ALICE:
      Listen carefully. >
      [[mia]]
      Will you help?
    * [Yes.]
      Thank you.
  end
  After.
end
`;

const RESPONSE = `scene start
  choose
    Which way?
    * [North.] You turn north.
    * [South.] -> start
    * Knock
      Nobody answers.
  then
    You step back.
  end
end
`;

const GATED = `scene start
  choose
    ALICE:
      Listen carefully. >
      Where now?
    if true then
      * [North.]
      * [South.]
    end
  end
  After.
end
`;

const shown = (root: ProgramRoot, line: number) =>
  root.addressAt(MAIN_URI, line, { beat: "last" });

const started = (root: ProgramRoot, line: number) =>
  root.addressAt(MAIN_URI, line);

describe("the preview address of a choose block's structural lines", () => {
  const root = rootOf(CAPTION);
  const menu = shown(root, 5);
  const speaker = shown(root, 3);

  it("gives the question's beat a different address from the speaker's line", () => {
    expect(menu).toBeDefined();
    expect(speaker).toBeDefined();
    expect(menu).not.toBe(speaker);
  });

  it("gives the choose line the menu", () => {
    expect(shown(root, 1)).toBe(menu);
  });

  it("gives the caption's speaker line the speaker's line", () => {
    expect(shown(root, 2)).toBe(speaker);
  });

  it("gives the block's end the menu", () => {
    expect(shown(root, 8)).toBe(menu);
  });

  it("leaves an option's body and the line after the block their own beats", () => {
    expect(shown(root, 7)).not.toBe(menu);
    expect(shown(root, 9)).toBe(started(root, 9));
  });

  it("leaves the PLAY start of every line as it was", () => {
    expect(started(root, 1)).toBe(speaker);
    expect(started(root, 8)).toBe(started(root, 9));
  });
});

describe.each([
  ["an if block", GATED],
  ["a do block", GATED.replace("if true then", "do")],
])("the preview address of a choose block whose options sit inside %s", (_name, text) => {
  const root = rootOf(text);
  const menu = shown(root, 4);
  const speaker = shown(root, 3);

  it("gives the choose line, the inner block's end and the block's end the menu", () => {
    expect(menu).toBeDefined();
    expect(menu).not.toBe(speaker);
    expect(shown(root, 1)).toBe(menu);
    expect(shown(root, 8)).toBe(menu);
    expect(shown(root, 9)).toBe(menu);
  });

  it("gives the caption's speaker line the speaker's line", () => {
    expect(shown(root, 2)).toBe(speaker);
  });

  it("leaves the line after the block its own beat", () => {
    expect(shown(root, 10)).toBe(started(root, 10));
  });
});

const NESTED = `scene start
  choose
    Outer?
    * Outer one
      choose
        Inner?
        * [Inner A]
        * [Inner B]
      end
      Back in outer one.
    * [Outer two]
  end
  After.
end
`;

describe("the preview address of a choose block inside an option's body", () => {
  const root = rootOf(NESTED);
  const outer = shown(root, 2);
  const inner = shown(root, 5);

  it("gives each block's choose line and end its own menu", () => {
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(inner).not.toBe(outer);
    expect(shown(root, 4)).toBe(inner);
    expect(shown(root, 8)).toBe(inner);
    expect(shown(root, 1)).toBe(outer);
    expect(shown(root, 11)).toBe(outer);
  });

  it("leaves the line after the inner block its own beat", () => {
    expect(shown(root, 9)).toBe(started(root, 9));
  });
});

describe("the preview address of a block's end after an edit", () => {
  it("follows the block's end when lines are added above and inside it", () => {
    const session = programSession(GATED.replace("  After.", "\n  After."));
    expect(shown(session.root, 9)).toBe(shown(session.root, 4));
    expect(shown(session.root, 10)).not.toBe(shown(session.root, 4));
    const moved = session.edit("scene start\n", "scene start\n  Before.\n");
    expect(shown(moved, 10)).toBe(shown(moved, 5));
    const grown = session.edit("      * [South.]\n", "      * [South.]\n      * [West.]\n");
    expect(shown(grown, 11)).toBe(shown(grown, 5));
    expect(shown(grown, 12)).not.toBe(shown(grown, 5));
  });
});

describe("the preview address of an option line", () => {
  const root = rootOf(RESPONSE);
  const menu = shown(root, 2);

  it.each([
    ["with response text", 3],
    ["with a divert", 4],
    ["without brackets", 5],
  ])("gives an option line %s its offer in the menu, not what runs after it is taken", (_name, line) => {
    const address = shown(root, line)!;
    expect(address).toBeDefined();
    expect(chunkOfAddress(address)).toBe(chunkOfAddress(menu!));
    expect(root.locationOf(address)?.startLine).toBe(line);
    expect(offsetOfAddress(address)).toBeLessThan(offsetOfAddress(started(root, line)!));
  });

  it("gives a bare option line the address it had", () => {
    const root = rootOf(CAPTION);
    expect(shown(root, 6)).toBe(started(root, 6));
  });

  it("gives the block's end the menu", () => {
    expect(shown(root, 9)).toBe(menu);
  });

  it("leaves a then clause's header and body out of the menu", () => {
    expect(shown(root, 7)).not.toBe(menu);
    expect(shown(root, 8)).not.toBe(menu);
  });
});
