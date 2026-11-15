import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

const play = (source: string) => {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors: string[] = [];
  ctx.story.onError = (message: string) => errors.push(message);
  const output = runToEnd(ctx.story);
  return { output, compileErrors: ctx.errorMessages, errors };
};

describe("a scene's own lines skip its branches, and a branch runs only when diverted to", () => {
  test("the lines after a branch's end run as the scene's, after the scene's lines above the branch", () => {
    expect(
      play(`store x = 0
scene start
  Outer.
  branch nested
    Inner.
  end
  & x = 1

  After {x}.
end
`),
    ).toEqual({ output: "Outer.\nAfter 1.\n", compileErrors: [], errors: [] });
  });

  test("a branch diverted to runs its own lines only and ends at its end", () => {
    expect(
      play(`store x = 0
scene start
  Outer.
  -> nested
  branch nested
    Inner {x}.
  end
  & x = 1

  After {x}.
end
`),
    ).toEqual({ output: "Outer.\nInner 0.\n", compileErrors: [], errors: [] });
  });

  test("a scene that opens on a branch does not enter it", () => {
    expect(
      play(`scene start
  branch opening
    Inner.
  end
end
`),
    ).toEqual({ output: "", compileErrors: [], errors: [] });
  });

  test("a scene that opens on a branch runs its lines after the branch's end", () => {
    expect(
      play(`scene start
  branch opening
    Inner.
  end
  After.
end
`),
    ).toEqual({ output: "After.\n", compileErrors: [], errors: [] });
  });

  test("a scene with parameters that opens on a branch does not enter it", () => {
    expect(
      play(`scene start
  -> greet("Ann")
end
scene greet(name)
  branch opening
    Inner {name}.
  end
  Hello {name}.
end
`),
    ).toEqual({ output: "Hello Ann.\n", compileErrors: [], errors: [] });
  });

  test("the lines between two branches run as the scene's", () => {
    expect(
      play(`scene start
  One.
  branch a
    In a.
  end
  Two.
  branch b
    In b.
  end
  Three.
  -> b
end
`),
    ).toEqual({ output: "One.\nTwo.\nThree.\nIn b.\n", compileErrors: [], errors: [] });
  });
});

describe("a flow reaching its end inside a tunnel or a thread", () => {
  test("a branch reaching its end inside a tunnel stops the story without returning to the caller", () => {
    expect(
      play(`scene start
  Before.
  -> b ->
  Back.
  branch b
    In b.
  end
  After.
end
`),
    ).toEqual({ output: "Before.\nIn b.\n", compileErrors: [], errors: [] });
  });

  test("a scene reaching its end inside a tunnel stops the story without returning to the caller", () => {
    expect(
      play(`scene start
  Before.
  -> other ->
  Back.
end
scene other
  In other.
end
`),
    ).toEqual({ output: "Before.\nIn other.\n", compileErrors: [], errors: [] });
  });

  test("a branch reaching its end inside a thread ends the thread, and the story goes on", () => {
    expect(
      play(`scene start
  Before.
  <- b
  Back.
  branch b
    In b.
  end
  After.
end
`),
    ).toEqual({ output: "Before.\nIn b.\nBack.\nAfter.\n", compileErrors: [], errors: [] });
  });
});
