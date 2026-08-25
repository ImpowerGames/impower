// An empty assignment RHS (`name =` with nothing after the `=`) is a parse
// error in Luau:
//
//   Expected identifier when parsing expression, got 'end'
//
// The grammar no longer lets the `=` swallow the next line's `end`
// (`reproEmptyRhs.test.ts`); this suite verifies the compiler additionally
// SURFACES the mistake as an Error-severity diagnostic — across define
// properties, `local`/`store` declarations, and reassignments — so authors
// get a hint instead of a silently-dropped property.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

interface CapturedDiagnostic {
  message: string;
  severity: number | undefined;
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
        startLine: (d as any).range?.start?.line,
      });
    }
  }
  return all;
}

const emptyRhsDiagnostics = (source: string): CapturedDiagnostic[] =>
  compileAndCollectDiagnostics(source).filter((d) =>
    d.message.startsWith("Expected identifier when parsing expression"),
  );

describe("empty assignment RHS diagnostic", () => {
  test("define property `name =` then `end` → got 'end' (Error)", () => {
    const src = `define KING as character with
  name =
end
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got 'end'",
    );
    expect(diags[0]!.severity).toBe(1); // Error
  });

  test("define property followed by another property → got the next prop name", () => {
    const src = `define KING as character with
  name =
  color = red
end
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got 'color'",
    );
  });

  test("`store x =` at end of file → got <eof>", () => {
    const src = `store x =`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got <eof>",
    );
  });

  test("empty RHS inside a function body (reassignment) is flagged", () => {
    const src = `function f
  x =
end
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got 'end'",
    );
  });

  test("empty compound RHS (`count +=`) is flagged", () => {
    const src = `function f
  count +=
end
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
  });

  test("a property WITH a value produces no such diagnostic", () => {
    const src = `define KING as character with
  name = "Arthur"
end
`;
    expect(emptyRhsDiagnostics(src)).toHaveLength(0);
  });

  test("a bare `local x` declaration (no `=`) is valid — no diagnostic", () => {
    const src = `function f
  local x
end
`;
    expect(emptyRhsDiagnostics(src)).toHaveLength(0);
  });

  // A comment is lexical whitespace to Luau, so an RHS that is ONLY a comment
  // is still empty — and is the most realistic way to hit this (type a value,
  // leave a `-- TODO`). The check is tree-based, not raw-text, so the comment
  // text must not mask the emptiness.
  test("a line comment after `=` does not count as a value (define prop)", () => {
    const src = `define K as character with
  name = -- the king
end
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got 'end'",
    );
  });

  test("a line comment after `=` does not count as a value (reassignment)", () => {
    const src = `function f
  x = -- later
end
`;
    expect(emptyRhsDiagnostics(src)).toHaveLength(1);
  });

  test("a block comment after `=` does not count as a value", () => {
    const src = `function f
  x = --[[ tbd ]]
end
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got 'end'",
    );
  });

  test("a value WITH a trailing comment is fine — no diagnostic", () => {
    const src = `define K as character with
  name = "Arthur" -- the king
end
`;
    expect(emptyRhsDiagnostics(src)).toHaveLength(0);
  });

  // Coverage parity across every path that lowers an assignment RHS.
  test("bare multi-target reassignment (`a, b =`) is flagged", () => {
    const src = `function f
  a, b =
end
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got 'end'",
    );
  });

  test("a valued multi-target reassignment is fine — no diagnostic", () => {
    const src = `function f
  a, b = 1, 2
end
`;
    expect(emptyRhsDiagnostics(src)).toHaveLength(0);
  });

  test("an empty table-literal entry (`{ a = }`) is flagged", () => {
    const src = `store t = { a = }
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got '}'",
    );
  });

  test("a valued table-literal entry is fine — no diagnostic", () => {
    const src = `store t = { a = 1 }
`;
    expect(emptyRhsDiagnostics(src)).toHaveLength(0);
  });

  // Sparkdown assignments are line-bounded (newlines are implicit statement
  // enders — the same decision that stops `=` from swallowing a later `end`).
  // So a value on the NEXT line is genuinely NOT bound to the `=`, and the
  // diagnostic correctly reports the empty RHS — pointing at the orphaned
  // value as the unexpected token. (Real Luau would accept `x =\n{…}`; authored
  // Sparkdown always opens the `{`/`(` on the `=` line. This is intentional —
  // see reproEmptyRhs.test.ts and the grammar comment on LuauAssignmentOperator.)
  test("a value opening on the NEXT line is flagged (line-bounded by design)", () => {
    const src = `store t =
{ a = 1 }
`;
    const diags = emptyRhsDiagnostics(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Expected identifier when parsing expression, got '{'",
    );
  });

  // The squiggle should land on the operator token, not its trailing spaces.
  test("diagnostic range covers just the `=`, not its trailing whitespace", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        {
          uri: "inmemory:///main.sd",
          type: "script",
          name: "main",
          ext: "sd",
          text: "store x =   \n",
          version: 1,
          languageId: "sparkdown",
        },
      ],
    });
    const result = compiler.compile({
      textDocument: { uri: "inmemory:///main.sd" },
    });
    const diag = Object.values(result.program.diagnostics ?? {})
      .flat()
      .find((d: any) =>
        (typeof d.message === "string" ? d.message : d.message?.value)?.startsWith(
          "Expected identifier when parsing expression",
        ),
      ) as any;
    expect(diag).toBeTruthy();
    // `store x =` — the `=` is at character index 8 (0-based), so a one-char
    // range is [8, 9). The 3 trailing spaces must NOT widen it.
    expect(diag.range.start.character).toBe(8);
    expect(diag.range.end.character).toBe(9);
  });
});
