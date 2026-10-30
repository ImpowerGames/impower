import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";
import { ControlCommand } from "../../runtime/ControlCommand";
import { StringValue } from "../../runtime/Value";

const run = (source: string) => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  ctx.story.collapseWhitespace = false;
  const state = ctx.story.state;
  const push = state.PushToOutputStream.bind(state);
  let most = 0;
  state.PushToOutputStream = (obj) => {
    push(obj);
    const stream = state.outputStream;
    let held = 0;
    for (let i = stream.length - 1; i >= 0; i--) {
      const o = stream[i];
      if (
        o instanceof ControlCommand &&
        o.commandType == ControlCommand.CommandType.BeginString
      ) {
        most = Math.max(most, held);
        break;
      }
      if (o instanceof StringValue && o.isNewline) held++;
    }
  };
  return { text: runToEnd(ctx.story), most };
};

const loopThen = (passes: number, after: string) => `function f()
  local n = 0
  while n < ${passes} do
    n = n + 1
  end
${after}  return n
end

scene start
  BOB:
    Spinning {f()}.
end
`;

describe("loop newlines inside a function called from an interpolation", () => {
  test("a print after the loop leaves the loop's newlines out of the displayed line", () => {
    expect(run(loopThen(3, `  print("hi")\n`)).text).toBe("Spinning hi3.\n");
  });

  test("newlines held inside the open string do not grow with the loop's passes", () => {
    const thousand = run(loopThen(1000, ""));
    expect(thousand.text).toBe("Spinning 1000.\n");
    expect(thousand.most).toBeLessThanOrEqual(1);
  });

  test("reading the stream grows linearly with passes that keep whitespace", () => {
    const reads = (passes: number) => {
      const ctx = makeRuntimeStoryFromSource(`function f()
  local n = 0
  while n < ${passes} do
    n = n + 1
    print(" ")
  end
  return n
end

scene start
  BOB:
    Spinning {f()}.
end
`);
      expect(ctx.errorMessages).toEqual([]);
      ctx.story.collapseWhitespace = false;
      const flow =
        (ctx.story.state as any)._currentFlow ?? (ctx.story.state as any);
      let count = 0;
      flow.outputStream = new Proxy(flow.outputStream, {
        get(target, key, receiver) {
          if (typeof key === "string" && /^\d+$/.test(key)) count++;
          return Reflect.get(target, key, receiver);
        },
      });
      expect(runToEnd(ctx.story)).toContain(`${passes}.`);
      return count;
    };
    const small = reads(200);
    const large = reads(800);
    expect(large / small).toBeLessThan(8);
  });

  test("a loop that makes no pass is unaffected", () => {
    expect(run(loopThen(0, `  print("hi")\n`)).text).toBe("Spinning hi0.\n");
  });

  const inner = (body: string) =>
    run(`function g()
  local n = 0
  while n < 2 do
    n = n + 1
  end
${body}end

scene start
  BOB:
    Got {g()}.
end
`).text;

  test("a lone newline string built inside the function keeps its newline", () => {
    expect(inner(`  return #("\\n")\n`)).toBe("Got 1.\n");
  });

  test("a string built inside the function keeps its literal newline", () => {
    expect(inner(`  return "a\\nb"\n`)).toBe("Got a\nb.\n");
  });

  test("a multiline long string built inside the function keeps its newline", () => {
    expect(inner(`  return [[a\nb]]\n`)).toBe("Got a\nb.\n");
  });

  test("text in a string built inside the function does not stop a later loop's newlines being dropped", () => {
    expect(
      run(`function f()
  local s = "word"
  local n = 0
  while n < 3 do
    n = n + 1
  end
  print("hi")
  return n
end

scene start
  BOB:
    Spinning {f()}.
end
`).text,
    ).toBe("Spinning hi3.\n");
  });
});
