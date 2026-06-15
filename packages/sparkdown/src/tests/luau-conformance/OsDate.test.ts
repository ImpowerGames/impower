// `os.date` — strftime-style date formatting. Tests use a fixed
// epoch second so they're stable across timezones / runs:
//
//   2026-05-20 14:30:45 UTC  =  Unix timestamp 1779287445
//
// Local-time tests assert via `!` prefix (UTC) so the harness
// produces deterministic output regardless of host timezone.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const FIXED_EPOCH = 1779287445; // 2026-05-20 14:30:45 UTC (Wednesday)

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
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
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("os.date — format strings", () => {
  test("%Y-%m-%d format", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%Y-%m-%d", ${FIXED_EPOCH}))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["2026-05-20"]);
  });

  test("time-only %H:%M:%S", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%H:%M:%S", ${FIXED_EPOCH}))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["14:30:45"]);
  });

  test("12-hour clock with %I and %p", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%I:%M %p", ${FIXED_EPOCH}))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["02:30 PM"]);
  });

  test("named weekday + month: %A %B", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%A, %B %d, %Y", ${FIXED_EPOCH}))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Wednesday, May 20, 2026"]);
  });

  test("abbreviated %a %b", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%a %b %d", ${FIXED_EPOCH}))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Wed May 20"]);
  });

  test("%%  produces literal percent", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%d%% done", ${FIXED_EPOCH}))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["20% done"]);
  });

  test("day-of-year %j", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%j", ${FIXED_EPOCH}))
end
`);
    expect(errors).toEqual([]);
    // 2026-05-20 — May is month 5. 31+28+31+30+20 = 140.
    expect(recorded).toEqual(["140"]);
  });
});

describe("os.date — table form (*t)", () => {
  test("returns a table with all fields", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = os.date("!*t", ${FIXED_EPOCH})
host_record(t.year)
host_record(t.month)
host_record(t.day)
host_record(t.hour)
host_record(t.min)
host_record(t.sec)
host_record(t.wday)
host_record(t.yday)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2026, 5, 20, 14, 30, 45, 4, 140]);
  });
});

describe("os.date — error paths", () => {
  test("unknown conversion errors", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%Q", ${FIXED_EPOCH}))
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("%Q");
  });

  test("dangling % errors", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(os.date("!%Y-%", ${FIXED_EPOCH}))
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("invalid conversion specifier");
  });
});
