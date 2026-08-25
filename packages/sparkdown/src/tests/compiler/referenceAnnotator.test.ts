import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

// The ReferenceAnnotator feeds find-references, rename, go-to-definition, and
// hover (via the `references` channel). The Luau port renamed the declaration/
// reference grammar nodes, so its function/variable/param/define branches went
// dead. These tests lock in the restored CORE behavior (D1): a declaration
// emits a `write` mark and references emit `read` marks sharing a symbolId, so
// the providers can match them. (Struct-property + define-type-model references
// are covered separately.)

interface Ref {
  declaration?: string;
  kind?: string;
  symbolIds?: string[];
  text: string;
}

function collectReferences(source: string): Ref[] {
  const reg = new SparkdownDocumentRegistry(["references"]);
  const uri = "file:///ref.sd";
  reg.set({
    textDocument: { uri, text: source, version: 1, languageId: "sparkdown" },
  });
  const annotations = reg.annotations(uri);
  if (!annotations) throw new Error("no annotations");
  const out: Ref[] = [];
  const cur = annotations.references.iter();
  while (cur.value) {
    // The marked payload (the Reference object) lives at `.type`.
    const v = (cur.value as any).type ?? {};
    out.push({
      declaration: v.declaration,
      kind: v.kind,
      symbolIds: v.symbolIds,
      text: source.slice(cur.from, cur.to).trim(),
    });
    cur.next();
  }
  return out;
}

function find(refs: Ref[], text: string, kind?: string): Ref | undefined {
  return refs.find((r) => r.text === text && (kind == null || r.kind === kind));
}

describe("ReferenceAnnotator · core (D1)", () => {
  test("function declaration + call share a symbolId", () => {
    const refs = collectReferences(`function greet()
end
& greet()
`);
    const decl = find(refs, "greet", "write");
    expect(decl?.declaration).toBe("function");
    expect(decl?.symbolIds).toContain("greet");
    // The call site is a read referencing the same symbol.
    const reads = refs.filter((r) => r.text === "greet" && r.kind === "read");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.some((r) => r.symbolIds?.includes("greet"))).toBe(true);
  });

  test("store / const variable declarations emit write marks", () => {
    const refs = collectReferences(`store FOO = 1
function r()
  const BAR = 2
end
`);
    const foo = find(refs, "FOO", "write");
    expect(foo?.declaration).toBe("var");
    expect(foo?.symbolIds).toContain("FOO");
    const bar = find(refs, "BAR", "write");
    expect(bar?.declaration).toBe("const");
    expect(bar?.symbolIds).toContain("BAR");
  });

  test("variable read references its declaration", () => {
    const refs = collectReferences(`store score = 0
function bump()
  score = score + 1
end
{score}
`);
    // The write (declaration) exists.
    expect(find(refs, "score", "write")?.declaration).toBe("var");
    // At least one read carries a symbolId matching the declaration.
    const reads = refs.filter((r) => r.text === "score" && r.kind === "read");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.some((r) => r.symbolIds?.includes("score"))).toBe(true);
  });

  test("function parameter is recorded with a function-scoped symbolId", () => {
    const refs = collectReferences(`function greet(who)
end
`);
    const param = find(refs, "who", "write");
    expect(param?.declaration).toBe("param");
    expect(param?.symbolIds).toContain("greet.who");
  });
});
