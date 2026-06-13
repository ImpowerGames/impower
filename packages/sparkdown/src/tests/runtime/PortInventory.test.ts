// PORT-READINESS INVENTORY — one test per construct in the
// companion/O/N sample. A PASSING test = the construct works today.
// A FAILING test = a documented gap to build before porting a real
// `.sd` script. Tests are grouped: (A) Luau logic we've built,
// (B) uncertain features / likely gaps, (C) narrative display.
//
// Run: npx vitest run .../PortInventory.test.ts
// The failures ARE the to-build list.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

// Hint/Information diagnostics are stylistic (faded in VS Code), not
// blockers — filter them so the inventory reflects only real issues.
const HINT_NOISE = [
  "Unreachable statement detected",
  "discard prefix is redundant",
];

// Compile + run a snippet, binding a `host_record` recorder so
// snippets can surface values without an unbound-external runtime
// throw. Captures compile diagnostics, recorded values, story output,
// and any runtime error — never throws.
function probe(source: string): {
  errors: string[];
  warnings: string[];
  recorded: unknown[];
  output: string;
  compiled: boolean;
  runtimeError: string | null;
} {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const docDiags of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiags as any[]) {
      const msg =
        typeof d?.message === "string"
          ? d.message
          : (d?.message?.value ?? JSON.stringify(d));
      if (HINT_NOISE.some((h) => msg.includes(h))) continue;
      if (d?.severity === 1) errors.push(msg);
      else if (d?.severity === 2) warnings.push(msg);
      else if (d?.severity == null) errors.push(msg);
    }
  }
  const recorded: unknown[] = [];
  let output = "";
  let runtimeError: string | null = null;
  const compiled = result.program.compiled != null;
  if (compiled) {
    const story = new RuntimeStory(
      result.program.compiled as Record<string, any>,
    );
    story.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    story.onError = (m: string) => {
      runtimeError = m;
    };
    try {
      output = story.ContinueMaximally();
    } catch (e) {
      runtimeError = (e as Error).message;
    }
  }
  return { errors, warnings, recorded, output, compiled, runtimeError };
}

// ============================================================
// (A) Luau logic — expected to work.
// ============================================================
describe("inventory · A · luau logic", () => {
  test("undeclared global assignment (& foundTheAlley = true)", () => {
    const r = probe(`external host_record(v)
& foundTheAlley = true
& run()
done

function run()
host_record(foundTheAlley)
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("const reference (MAX_TRUST)", () => {
    const r = probe(`external host_record(v)
const MAX_TRUST = 100
& run()
done

function run()
host_record(MAX_TRUST)
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("typed scene param + property access + compound assign (c.trust -= 1)", () => {
    const r = probe(`external host_record(v)
define companion as character with
  store trust = 5
end
define O as companion with
  name = "Orion"
end
-> main
scene main
  -> LoseTrust(companion.O) ->
  & host_record(companion.O.trust)
  done
end
scene LoseTrust(c: companion)
  if c.trust == 0 then
    & host_record(-1)
  else
    & c.trust -= 1
  end
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });
});

// ============================================================
// (B) Uncertain features / likely gaps.
// ============================================================
describe("inventory · B · uncertain", () => {
  test("enum-style constant via define (TIME_OF_DAY.NIGHT)", () => {
    const r = probe(`external host_record(v)
define TIME_OF_DAY with
  NIGHT = 2
  DAY = 1
end
& run()
done

function run()
host_record(TIME_OF_DAY.NIGHT)
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("GAP/DESIGN: nested table autovivification (inventory.star += 1, undeclared)", () => {
    const r = probe(`external host_record(v)
& inventory.star += 1
& run()
done

function run()
host_record(inventory.star)
end
`);
    // CURRENT: like Luau, indexing an undeclared nil errors. The
    // sample writes `inventory.star += 1` directly — DESIGN DECISION:
    // autovivify `inventory` on first nested write, or require a
    // declaration. When resolved, flip this assertion.
    expect(r.runtimeError).toContain("attempt to index a nil value");
  });

  test("nested table with explicit declaration (inventory = {} then .star += 1)", () => {
    const r = probe(`external host_record(v)
& inventory = { star = 0 }
& inventory.star += 1
& run()
done

function run()
host_record(inventory.star)
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("format is string.format (sample typo) — string.format works", () => {
    const r = probe(`external host_record(v)
& run()
done

function run()
host_record(string.format("%d at %s", 2000, "night"))
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
    expect(r.recorded).toEqual(["2000 at night"]);
  });

  test("print() emits display text from a function body", () => {
    const r = probe(`-> main
scene main
  & run()
  done
end
function run()
print("Footprints... glowing?")
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
    // print is the escape hatch for display output inside functions.
    expect(r.output).toContain("Footprints... glowing?");
  });

  test("log() is developer console output, NOT story display", () => {
    const r = probe(`-> main
scene main
  & run()
  Visible.
  done
end
function run()
log("debug only")
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
    expect(r.output).toContain("Visible");
    // log goes to console, never the player-visible output.
    expect(r.output).not.toContain("debug only");
  });
});

// ============================================================
// (C) Narrative display — core sparkdown syntax.
// ============================================================
describe("inventory · C · display", () => {
  test("dialogue line (O: text)", () => {
    const r = probe(`-> main
scene main
  O: Footprints... glowing?
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.output).toContain("Footprints");
  });

  test("scene heading ($: text)", () => {
    const r = probe(`-> main
scene main
  $: A DARK ALLEYWAY
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.output).toContain("DARK ALLEYWAY");
  });

  test("interpolation in display text ({expr})", () => {
    const r = probe(`-> main
scene main
  & name = "Orion"
  {name} enters.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.output).toContain("Orion enters");
  });

  test("image command line ([[show backdrop x]])", () => {
    const r = probe(`-> main
scene main
  [[show backdrop alley_neon]]
  Text.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("audio command line (((play music x)))", () => {
    const r = probe(`-> main
scene main
  ((play music stars))
  Text.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("SYNTAX: bare choice marks must be wrapped in choose...end", () => {
    const r = probe(`-> main
scene main
  Intro.
  + [I'll protect it.] -> ProtectStar
  + [Let's take it.] -> TakeStar
  done
end
scene ProtectStar
  Protected.
  done
end
scene TakeStar
  Taken.
  done
end
`);
    // CURRENT: bare `+`/`*` choices error — sparkdown requires a
    // `choose ... end` wrapper (unlike ink). The sample's bare
    // choices need migration to the wrapped form (next test).
    expect(r.errors.join(" ")).toContain("choose");
  });

  test("choice inside choose...end block", () => {
    const r = probe(`-> main
scene main
  Intro.
  choose
    + [I'll protect it.] -> ProtectStar
    + [Let's take it.] -> TakeStar
  end
end
scene ProtectStar
  Protected.
  done
end
scene TakeStar
  Taken.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.output).toContain("Intro");
  });

  test("branch block (branch X ... end)", () => {
    const r = probe(`-> main
scene main
  branch ProtectStar
    Protected.
  end
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("tunnel call no-arg (-> PassTime() ->)", () => {
    const r = probe(`-> main
scene main
  -> PassTime() ->
  After.
  done
end
scene PassTime()
  Time passes.
  ->->
end
`);
    expect(r.errors).toEqual([]);
    expect(r.runtimeError).toBe(null);
  });

  test("text emphasis (*here*)", () => {
    const r = probe(`-> main
scene main
  The star fell *here*.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.output).toContain("here");
  });
});
