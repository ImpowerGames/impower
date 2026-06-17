import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

// The DeclarationAnnotator feeds the document outline (getDocumentSymbols) and
// scope-aware completion (getDeclarationScopes). After the Luau port renamed the
// declaration grammar nodes, most of its branches went dead — functions,
// variables, defines, and params stopped being recorded. These tests lock in
// the restored behavior against the CURRENT grammar. Harness mirrors
// semanticTokenShadowing.test.ts: pass `["declarations"]` so the annotator runs.

interface Decl {
  type: string;
  text: string;
}

function collectDeclarations(source: string): Decl[] {
  const reg = new SparkdownDocumentRegistry(["declarations"]);
  const uri = "file:///decl.sd";
  reg.set({
    textDocument: { uri, text: source, version: 1, languageId: "sparkdown" },
  });
  const annotations = reg.annotations(uri);
  if (!annotations) throw new Error("no annotations");
  const out: Decl[] = [];
  const cur = annotations.declarations.iter();
  while (cur.value) {
    out.push({ type: cur.value.type as string, text: source.slice(cur.from, cur.to).trim() });
    cur.next();
  }
  return out;
}

function has(decls: Decl[], type: string, text: string): boolean {
  return decls.some((d) => d.type === type && d.text === text);
}

describe("DeclarationAnnotator · current Luau grammar", () => {
  test("functions, params, store/const/local variables, defines", () => {
    const decls = collectDeclarations(`store FOO = 1
function greet(who, times)
  const BAR = 2
  local msg = "hi"
end
screen hud with
  text
end
`);
    expect(has(decls, "var", "FOO")).toBe(true);
    expect(has(decls, "function", "greet")).toBe(true);
    expect(has(decls, "param", "who")).toBe(true);
    expect(has(decls, "param", "times")).toBe(true);
    expect(has(decls, "const", "BAR")).toBe(true);
    expect(has(decls, "var", "msg")).toBe(true);
    expect(has(decls, "define", "hud")).toBe(true);
  });

  test("narrative beats: scene / branch / label (already live, must stay)", () => {
    const decls = collectDeclarations(`scene main
  branch after
    choose
      * Hi
    then (gathered)
      done
    end
  end
end
`);
    expect(has(decls, "scene", "main")).toBe(true);
    expect(has(decls, "branch", "after")).toBe(true);
    expect(has(decls, "label", "gathered")).toBe(true);
  });

  test("reassignment is not a declaration (only the `store` definition is)", () => {
    const decls = collectDeclarations(`store score = 0
function bump()
  score = score + 1
end
`);
    // Exactly one `score` declaration (the store), none from the reassignment.
    expect(decls.filter((d) => d.text === "score").length).toBe(1);
    expect(has(decls, "var", "score")).toBe(true);
  });
});
