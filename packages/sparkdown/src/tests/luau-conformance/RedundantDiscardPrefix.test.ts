// Verifies that the `&` discard prefix on a Luau statement inside a
// function body produces an Information-severity diagnostic tagged
// `Unnecessary`. Outside a function (at top-level main flow), the
// same `&` is required and should produce NO diagnostic.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

interface CapturedDiagnostic {
  message: string;
  severity: number | undefined;
  tags: number[] | undefined;
  startLine: number | undefined;
}

function compileAndCollectDiagnostics(source: string): CapturedDiagnostic[] {
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
  const all: CapturedDiagnostic[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      const m = typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d);
      all.push({
        message: m,
        severity: (d as any).severity,
        tags: (d as any).tags,
        startLine: (d as any).range?.start?.line,
      });
    }
  }
  return all;
}

describe("redundant `&` prefix diagnostic", () => {
  test("fires on `& foo()` inside a function body", () => {
    const src = `external host_record(v)
& run()
done

function run()
& host_record(42)
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const redundant = diagnostics.filter((d) =>
      d.message.includes("`&` discard prefix is unnecessary"),
    );
    expect(redundant).toHaveLength(1);
    expect(redundant[0]!.severity).toBe(3); // Information
    expect(redundant[0]!.tags).toEqual([1]); // Unnecessary
  });

  test("fires on `& table.insert(...)` inside a function body", () => {
    const src = `external host_record(v)
& run()
done

function run()
local t = { 1, 2, 3 }
& table.insert(t, 99)
host_record(table.concat(t, ","))
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const redundant = diagnostics.filter((d) =>
      d.message.includes("`&` discard prefix is unnecessary"),
    );
    expect(redundant).toHaveLength(1);
  });

  test("fires on `& store x = 5` (declaration) inside a function body", () => {
    const src = `& run()
done

function run()
& local x = 5
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const redundant = diagnostics.filter((d) =>
      d.message.includes("`&` discard prefix is unnecessary"),
    );
    expect(redundant).toHaveLength(1);
  });

  test("does NOT fire on `& foo()` at top-level (the prefix is required there)", () => {
    const src = `external host_record(v)
& run()
done

function run()
host_record(1)
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const redundant = diagnostics.filter((d) =>
      d.message.includes("`&` discard prefix is unnecessary"),
    );
    expect(redundant).toHaveLength(0);
  });

  test("multiple redundant `&`s in one function each get their own diagnostic", () => {
    const src = `external host_record(v)
& run()
done

function run()
& host_record(1)
& host_record(2)
& host_record(3)
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const redundant = diagnostics.filter((d) =>
      d.message.includes("`&` discard prefix is unnecessary"),
    );
    expect(redundant).toHaveLength(3);
  });
});
