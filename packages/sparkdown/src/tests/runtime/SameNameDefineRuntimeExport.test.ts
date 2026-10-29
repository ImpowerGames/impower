import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compile(src: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  let errors = 0;
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) if (d?.severity === 1) errors++;
  }
  return {
    chunks: result.program.chunks,
    errors,
    program: result.program,
  };
}

describe("same-name define runtime export", () => {
  test("char+synth same name + later choice still produces a runnable program", () => {
    const r = compile(
      `define raffles as character with
  name = "RAFFLES"
end

define raffles as synth with
  pitch = {
    frequency = 340
  }
end

-> main

scene main
  RAFFLES:
    Hello.
  choose
    + Start text [pick me] tail
      You picked it.
  end
  done
end
`,
    );
    expect(r.errors).toBe(0);
    expect(r.chunks).toBeDefined();
    expect(r.program.context?.["character"]?.["raffles"]).toBeDefined();
    expect(r.program.context?.["synth"]?.["raffles"]).toBeDefined();
  });

  test("both same-name defines are reachable as type-namespaced runtime singletons", () => {
    const r = compile(
      `external host_record(v)

define raffles as character with
  name = "RAFFLES"
end

define raffles as synth with
  frequency = 340
end

& run()
done

function run()
host_record(character.raffles.name)
host_record(synth.raffles.frequency)
end
`,
    );
    expect(r.errors).toBe(0);
    expect(r.chunks).toBeDefined();

    const story = testStory(r.chunks);
    const recorded: unknown[] = [];
    story.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    const storyErrors: string[] = [];
    story.onError = (m: string) => storyErrors.push(m);
    story.ContinueMaximally();

    expect(storyErrors).toEqual([]);
    expect(recorded).toEqual(["RAFFLES", 340]);
  });
});
