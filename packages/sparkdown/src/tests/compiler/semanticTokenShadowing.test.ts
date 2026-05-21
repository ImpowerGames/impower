import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

// Verify the SemanticAnnotator emits the right LSP semantic token for
// stdlib name references based on whether they're shadowed by a local
// binding. The annotator is invoked by the document registry; the
// resulting annotations are read via `registry.annotations(uri)`.

type Token = { from: number; to: number; tokenType: string; modifiers: string[] };

function collectStdLibTokens(source: string): { text: string; tokens: Token[] } {
  // Pass `["semantics"]` so the SemanticAnnotator actually runs —
  // the registry default is no annotators.
  const reg = new SparkdownDocumentRegistry(["semantics"]);
  const uri = "file:///shadow.sd";
  reg.set({
    textDocument: { uri, text: source, version: 1, languageId: "sparkdown" },
  });
  const annotations = reg.annotations(uri);
  if (!annotations) throw new Error("no annotations");
  const tokens: Token[] = [];
  const cur = annotations.semantics.iter();
  while (cur.value) {
    const v = cur.value as any;
    const info = v.type;
    tokens.push({
      from: cur.from,
      to: cur.to,
      tokenType: info.tokenType,
      modifiers: info.tokenModifiers ?? [],
    });
    cur.next();
  }
  return { text: source, tokens };
}

function tokenAt(
  tokens: Token[],
  text: string,
  name: string,
  occurrence = 1,
): Token | undefined {
  let seen = 0;
  for (const t of tokens) {
    const slice = text.slice(t.from, t.to);
    if (slice === name) {
      seen++;
      if (seen === occurrence) return t;
    }
  }
  return undefined;
}

describe("Luau stdlib shadowing → semantic tokens", () => {
  test("unshadowed stdlib call gets function + defaultLibrary", () => {
    const { text, tokens } = collectStdLibTokens(`function run()
print("hi")
end
`);
    const printTok = tokenAt(tokens, text, "print");
    expect(printTok).toBeDefined();
    expect(printTok!.tokenType).toBe("function");
    expect(printTok!.modifiers).toContain("defaultLibrary");
  });

  test("local shadow → reference renders as variable, no defaultLibrary", () => {
    // After `local print = …`, subsequent `print(...)` inside the
    // same function body should render as a regular variable rather
    // than a stdlib function. The grammar still tags the token as
    // `LuauStdLibFunctions` (the match pattern is name-based), but
    // the annotator overrides the LSP semantic token to `variable`.
    const { text, tokens } = collectStdLibTokens(`function run()
local print = 1
print("not really called")
end
`);
    // The DECLARATION (`local print = 1`) emits a token at the
    // binding site too — the `LuauVariableName` reference. Both the
    // declaration and the call-site reference should be "variable".
    const decl = tokenAt(tokens, text, "print", 1);
    const callRef = tokenAt(tokens, text, "print", 2);
    expect(decl?.tokenType).toBe("variable");
    expect(callRef?.tokenType).toBe("variable");
    expect(callRef?.modifiers).not.toContain("defaultLibrary");
  });

  test("function parameter shadows stdlib name", () => {
    const { text, tokens } = collectStdLibTokens(`function f(print)
print("uses param")
end
`);
    // Only the body's call-site reference is tagged (the parameter
    // declaration uses the `LuauFunctionParameter` node, which we
    // don't currently emit a token for). The reference resolves
    // through the scope stack to the parameter binding → variable.
    const refTok = tokenAt(tokens, text, "print", 1);
    expect(refTok).toBeDefined();
    expect(refTok!.modifiers).not.toContain("defaultLibrary");
    expect(refTok!.tokenType).toBe("variable");
  });

  test("after the function ends, stdlib name returns to default kind", () => {
    // Two function definitions. Inside f, `print` is shadowed; inside
    // g (no shadow), `print` resolves to the stdlib entry. The leave
    // handler must pop f's scope frame so g's body sees the unshadowed
    // global binding.
    const { text, tokens } = collectStdLibTokens(`function f()
local print = 1
print("inner")
end
function g()
print("outer")
end
`);
    // 1st: f's declaration (variable). 2nd: f's call-site (variable).
    // 3rd: g's call-site (function + defaultLibrary).
    const innerRef = tokenAt(tokens, text, "print", 2);
    expect(innerRef!.tokenType).toBe("variable");
    const outerRef = tokenAt(tokens, text, "print", 3);
    expect(outerRef!.tokenType).toBe("function");
    expect(outerRef!.modifiers).toContain("defaultLibrary");
  });

  test("const local renders with readonly modifier", () => {
    const { text, tokens } = collectStdLibTokens(`function run()
const FOO = 42
local x = FOO
end
`);
    // The reference `FOO` on the RHS of `local x = FOO` should be a
    // variable with the `readonly` modifier (since FOO was declared
    // with `const`).
    const refTok = tokenAt(tokens, text, "FOO", 2);
    expect(refTok).toBeDefined();
    expect(refTok!.tokenType).toBe("variable");
    expect(refTok!.modifiers).toContain("readonly");
  });
});
