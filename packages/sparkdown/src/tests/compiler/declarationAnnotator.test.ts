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
layout hud with
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
    // The `end` after `then` closes the choice block, not the branch.
    expect(decls.filter((d) => d.type === "end").length).toBe(2);
  });

  test("an end is marked only where it closes a scene or branch", () => {
    const decls = collectDeclarations(`scene main
  if true then
    Yes.
  end
  function helper()
    return 1
  end
  branch after
    Inside.
  end
  Later.
end
`);
    expect(decls.map((d) => `${d.type} ${d.text}`)).toEqual([
      "scene main",
      "function helper",
      "branch after",
      "end end",
      "end end",
    ]);
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

  test("a local with no initializer that another statement follows on its line is a declaration", () => {
    const decls = collectDeclarations(`function main()
  local first return first
  local second if second then end
  local third, fourth return third
end
`);
    expect(has(decls, "var", "first")).toBe(true);
    expect(has(decls, "var", "second")).toBe(true);
    expect(has(decls, "var", "third")).toBe(true);
    expect(has(decls, "var", "fourth")).toBe(true);
    // The statement after the name is read, not declared.
    expect(decls.filter((d) => d.text === "first").length).toBe(1);
  });

  // #1279: the header-name rules keep their lookbehind on the block's keyword.
  // Their parents try them again at every position of the body, so without it
  // a word that follows a comment in the body, where no body rule begins, is
  // read as another name and declared.
  test("a word after a comment in a block body declares nothing", () => {
    const decls = collectDeclarations(`style banner with
--[[ note ]] accidental
end
layout hud with
  text "hi"
--[[ note ]] stray
end
component card(title) with
  --[[ note ]] other
end
screen menu with
--[[ note ]] extra
end
animation fade with
--[[ note ]] spare
end
external message(text) --[[ note ]] more
`);
    const defines = decls.filter((d) => d.type === "define").map((d) => d.text);
    expect(defines).toEqual(["banner", "hud", "card", "menu", "fade"]);
    const functions = decls.filter((d) => d.type === "function").map((d) => d.text);
    expect(functions).toEqual(["message"]);
  });
});
