// Function bodies use ordinary Luau statements. A removed `&` marker is
// a syntax error; story statements retain their marker.

import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { loadOfficialLuau } from "../compiler/officialLuau";

interface CapturedDiagnostic {
  message: string;
  severity: number | undefined;
  tags: number[] | undefined;
  startLine: number | undefined;
  startCharacter: number | undefined;
  endLine: number | undefined;
  endCharacter: number | undefined;
}

function compileAndCollectDiagnostics(source: string): CapturedDiagnostic[] {
  const compiler = testCompiler();
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
        startCharacter: (d as any).range?.start?.character,
        endLine: (d as any).range?.end?.line,
        endCharacter: (d as any).range?.end?.character,
      });
    }
  }
  return all;
}

describe("removed function `&` prefix diagnostic", () => {
  test.each([
    "function f()\n  & g()\n  h()\nend\n",
    "function f()\n  local function nested()\n    & g()\n  end\nend\n",
    "function f()\n  local nested = function()\n    & g()\n  end\nend\n",
    "function object:method()\n  & g()\nend\n",
    "type function f()\n  & g()\n  return types.number\nend\n",
    "define Hero with\n  method()\n    & g()\n    return 1\n  end\nend\n",
  ])("keeps the native marker diagnostic and authored range in %s", async source => {
    const nativeSource = source.startsWith("define")
      ? source.replace("define Hero with\n  method()", "\nfunction method()")
      : source;
    const official = await loadOfficialLuau("typecheck");
    const expected = official(nativeSource).diagnostics.find(error => error.message.includes("'&'"));
    expect(expected).toBeDefined();
    const actual = compileAndCollectDiagnostics(source).find(d => d.severity === 1 && d.message === expected!.message);
    expect(actual && {
      start: { line: actual.startLine, character: actual.startCharacter },
      end: { line: actual.endLine, character: actual.endCharacter },
    }).toEqual({
      start: { line: expected!.location.begin.line, character: expected!.location.begin.column },
      end: { line: expected!.location.end.line, character: expected!.location.end.column },
    });
  });

  test("fires on `& foo()` inside a function body", () => {
    const src = `external host_record(v)
& run()
done

function run()
& host_record(42)
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    expect(diagnostics.some((d) => d.severity === 1 && d.startLine === 5)).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("discard prefix is unnecessary"))).toBe(false);
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
    expect(diagnostics.some((d) => d.severity === 1 && d.startLine === 6)).toBe(true);
  });

  test("fires on `& store x = 5` (declaration) inside a function body", () => {
    const src = `& run()
done

function run()
& local x = 5
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    expect(diagnostics.some((d) => d.severity === 1 && d.startLine === 4)).toBe(true);
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
    expect(diagnostics.filter((d) => d.severity === 1)).toEqual([]);
  });

  test("each removed marker remains an error at its authored line", () => {
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
    for (const startLine of [5, 6, 7]) {
      expect(diagnostics.some((d) => d.severity === 1 && d.startLine === startLine)).toBe(true);
    }
  });
});
