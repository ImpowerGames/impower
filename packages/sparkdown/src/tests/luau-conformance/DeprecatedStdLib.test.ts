// Verifies that calls to Luau-deprecated stdlib entries (e.g.
// `table.getn`, `math.pow`, `unpack`) emit an Information-severity
// diagnostic tagged `Deprecated` (LSP tag = 2). The runtime still
// dispatches the call — the diagnostic is editor-side strikethrough
// only.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

interface CapturedDiagnostic {
  message: string;
  severity: number | undefined;
  tags: number[] | undefined;
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
      const m = typeof raw === "string" ? raw : (raw?.value ?? JSON.stringify(d));
      all.push({
        message: m,
        severity: (d as any).severity,
        tags: (d as any).tags,
      });
    }
  }
  return all;
}

describe("deprecated stdlib diagnostic", () => {
  test("`table.getn(t)` is flagged deprecated", () => {
    const src = `external host_record(v)
& run()
done

function run()
local t = { 1, 2, 3 }
host_record(table.getn(t))
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const dep = diagnostics.filter((d) => d.message.includes("table.getn"));
    expect(dep).toHaveLength(1);
    expect(dep[0]!.severity).toBe(3); // Information
    expect(dep[0]!.tags).toEqual([2]); // Deprecated
  });

  test("`math.pow(a, b)` is flagged deprecated (suggests `^`)", () => {
    const src = `external host_record(v)
& run()
done

function run()
host_record(math.pow(2, 8))
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const dep = diagnostics.filter((d) => d.message.includes("math.pow"));
    expect(dep).toHaveLength(1);
    expect(dep[0]!.severity).toBe(3);
    expect(dep[0]!.tags).toEqual([2]);
    expect(dep[0]!.message).toContain("^");
  });

  test("`unpack(t)` global is flagged deprecated (suggests `table.unpack`)", () => {
    const src = `external host_record(v)
& run()
done

function run()
local a, b, c = unpack({ 10, 20, 30 })
host_record(a)
host_record(b)
host_record(c)
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const dep = diagnostics.filter((d) => d.message.includes("unpack"));
    expect(dep).toHaveLength(1);
    expect(dep[0]!.severity).toBe(3);
    expect(dep[0]!.tags).toEqual([2]);
    expect(dep[0]!.message).toContain("table.unpack");
  });

  test("non-deprecated stdlib calls (`table.insert`, `math.sqrt`) emit no diagnostic", () => {
    const src = `external host_record(v)
& run()
done

function run()
local t = {}
table.insert(t, 1)
host_record(math.sqrt(16))
end
`;
    const diagnostics = compileAndCollectDiagnostics(src);
    const dep = diagnostics.filter((d) => d.tags?.includes(2));
    expect(dep).toEqual([]);
  });
});
