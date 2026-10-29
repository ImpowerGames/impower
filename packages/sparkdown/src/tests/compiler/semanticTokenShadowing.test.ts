import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

type Token = { from: number; to: number; tokenType: string; modifiers: string[] };

function collectStdLibTokens(source: string): { text: string; tokens: Token[] } {
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
  test("narrative-scope: function/variable references resolve through global scope", () => {
    const { text, tokens } = collectStdLibTokens(`store FOO = 1
function bar()
end
& bar()
{FOO}
`);
    const fooDecl = tokenAt(tokens, text, "FOO", 1);
    const fooRef = tokenAt(tokens, text, "FOO", 2);
    expect(fooDecl!.tokenType).toBe("variable");
    expect(fooDecl!.modifiers).toContain("declaration");
    expect(fooRef!.tokenType).toBe("variable");
    expect(fooRef!.modifiers).not.toContain("declaration");
    const barDecl = tokenAt(tokens, text, "bar", 1);
    const barRef = tokenAt(tokens, text, "bar", 2);
    expect(barDecl!.tokenType).toBe("function");
    expect(barDecl!.modifiers).toContain("declaration");
    expect(barRef!.tokenType).toBe("function");
    expect(barRef!.modifiers).not.toContain("declaration");
    expect(barDecl!.modifiers).not.toContain("defaultLibrary");
    expect(fooRef!.modifiers).not.toContain("defaultLibrary");
  });

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
    const { text, tokens } = collectStdLibTokens(`function run()
local print = 1
print("not really called")
end
`);
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
    const refTok = tokenAt(tokens, text, "print", 1);
    expect(refTok).toBeDefined();
    expect(refTok!.modifiers).not.toContain("defaultLibrary");
    expect(refTok!.tokenType).toBe("variable");
  });

  test("after the function ends, stdlib name returns to default kind", () => {
    const { text, tokens } = collectStdLibTokens(`function f()
local print = 1
print("inner")
end
function g()
print("outer")
end
`);
    const innerRef = tokenAt(tokens, text, "print", 2);
    expect(innerRef!.tokenType).toBe("variable");
    const outerRef = tokenAt(tokens, text, "print", 3);
    expect(outerRef!.tokenType).toBe("function");
    expect(outerRef!.modifiers).toContain("defaultLibrary");
  });

  test("const local renders with readonly + static modifiers", () => {
    const { text, tokens } = collectStdLibTokens(`function run()
const FOO = 42
local x = FOO
end
`);
    const decl = tokenAt(tokens, text, "FOO", 1);
    const ref = tokenAt(tokens, text, "FOO", 2);
    expect(decl!.tokenType).toBe("variable");
    expect(decl!.modifiers).toContain("readonly");
    expect(decl!.modifiers).toContain("static");
    expect(decl!.modifiers).toContain("declaration");
    expect(ref!.tokenType).toBe("variable");
    expect(ref!.modifiers).toContain("readonly");
    expect(ref!.modifiers).toContain("static");
    expect(ref!.modifiers).not.toContain("declaration");
  });

  test("non-const local does NOT have readonly / static", () => {
    const { text, tokens } = collectStdLibTokens(`function run()
local x = 1
local y = x
end
`);
    const decl = tokenAt(tokens, text, "x", 1);
    const ref = tokenAt(tokens, text, "x", 2);
    expect(decl!.modifiers).not.toContain("readonly");
    expect(decl!.modifiers).not.toContain("static");
    expect(decl!.modifiers).toContain("declaration");
    expect(ref!.modifiers).not.toContain("readonly");
    expect(ref!.modifiers).not.toContain("static");
    expect(ref!.modifiers).not.toContain("declaration");
  });
});
