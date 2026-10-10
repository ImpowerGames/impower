import { describe, expect, test } from "vitest";
import { complete, labelsAt } from "./completionHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getCompletions } from "../../utils/providers/getCompletions";
import { getAnnotatedScripts } from "../../utils/annotations/getAnnotatedScripts";

describe("static member completion while editing", () => {
  test("a typed define exposes its own fields and methods through its declared namespace", () => {
    const source = 'define ui as config with\n  root_text_size = "112.5%"\n  inner = { score = 1 }\n  function refresh() end\nend\nfunction inspect()\n  return config.ui.@1\n  return config.ui.inner.@2\n  config.ui:@3\nend\n';
    expect(labelsAt(source, { at: "1" }).sort()).toEqual(["inner", "refresh", "root_text_size"]);
    expect(labelsAt(source, { at: "2" })).toEqual(["score"]);
    // Exercise the colon in its own valid statement sequence, rather than
    // after two unfinished returns that put the reader into recovery.
    expect(labelsAt(source.replace("  return config.ui.@1\n  return config.ui.inner.@2\n", ""), { at: "3" })).toEqual(["refresh"]);
  });

  test("namespace registration preserves root fields, sibling instances and authored ancestors", () => {
    const source = "define config with\n  rootField = 1\nend\ndefine group as config with\n  groupField = 1\nend\ndefine ui as group with\n  ownField = 1\nend\ndefine audio as config with\n  volume = 1\nend\nfunction inspect()\n  return config.@1\n  return group.@2\n  return config.ui.@3\n  return group.ui.@4\nend\n";
    expect(labelsAt(source, { at: "1" }).sort()).toEqual(["audio", "group", "rootField", "ui"]);
    expect(labelsAt(source, { at: "2" }).sort()).toEqual(["groupField", "ui"]);
    expect(labelsAt(source, { at: "3" })).toEqual(["ownField"]);
    expect(labelsAt(source, { at: "4" })).toEqual(["ownField"]);
  });

  test("a typed leaf leaves its bare name free and local namespace shadows remain unknown", () => {
    const source = "define ui as config with\n  ownField = 1\nend\nstore ui = { storedField = 1 }\nfunction inspect(config)\n  return config.ui.@1\n  return ui.@2\nend\nfunction other()\n  return config.ui.@3\nend\n";
    expect(labelsAt(source, { at: "1" })).toEqual([]);
    expect(labelsAt(source, { at: "2" })).toEqual(["storedField"]);
    expect(labelsAt(source, { at: "3" })).toEqual(["ownField"]);
    expect(labelsAt(source.replace("store ui = { storedField = 1 }\n", ""), { at: "2" })).toEqual([]);
  });

  test("an explicitly used type keeps its own bare shape without inferring inherited fields", () => {
    const source = "define Base with\n  inherited = 1\nend\ndefine Hero as Base with\n  own = 1\nend\nfunction inspect()\n  local h = new Hero()\n  return Hero.@1\nend\n";
    expect(labelsAt(source)).toEqual(["own"]);
  });

  test("same-named leaf instances under different parents keep distinct shapes", () => {
    const source = "define ui as config with\n  configField = 1\nend\ndefine ui as settings with\n  settingsField = 1\nend\nfunction inspect()\n  return config.ui.@1\n  return settings.ui.@2\nend\n";
    expect(labelsAt(source, { at: "1" })).toEqual(["configField"]);
    expect(labelsAt(source, { at: "2" })).toEqual(["settingsField"]);
  });

  test("cyclic authored parent registrations are bounded", () => {
    const source = "define A as B with\n  ownA = 1\nend\ndefine B as A with\n  ownB = 1\nend\nfunction inspect()\n  return A.B.@1\nend\n";
    expect(labelsAt(source).sort()).toEqual(["A", "B", "ownB"]);
  });

  test.each([[false, false], [false, true], [true, false], [true, true]])("foreign namespace discovery, merging and edits preserve the requesting tree (reverse=%s, root=%s)", (reverse, root) => {
    const main = "file:///proj/main.sd";
    const first = "file:///proj/first.sd";
    const second = "file:///proj/second.sd";
    const source = (root ? "define config with\n  rootField = 1\nend\n" : "") + "store owned = { currentField = 1 }\nfunction inspect()\n  return config.\n  return config.ui.\n  return config.audio.\n  return owned.\nend\n";
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri: main, text: source, version: 1, languageId: "sparkdown" } });
    documents.set({ textDocument: { uri: first, text: "define ui as config with\n  before = 1\nend\nstore owned = { foreignField = 1 }\n", version: 1, languageId: "sparkdown" } });
    documents.set({ textDocument: { uri: second, text: "define audio as config with\n  volume = 1\nend\n", version: 1, languageId: "sparkdown" } });
    const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
    const document = documents.get(main)!;
    const tree = documents.tree(main)!;
    const uris = reverse ? [second, first, main] : [main, first, second];
    const request = (receiver: string) => (getCompletions(document, tree, getAnnotatedScripts(main, Object.fromEntries(uris.map((uri) => [uri, 1])), workspace), undefined, undefined, document.positionAt(source.indexOf(receiver) + receiver.length), undefined) ?? []).map((item) => item.label).sort();
    expect(request("owned.")).toEqual(["currentField"]);
    expect(request("config.")).toEqual(root ? ["audio", "rootField", "ui"] : ["audio", "ui"]);
    expect(request("config.ui.")).toEqual(["before"]);
    expect(request("config.audio.")).toEqual(["volume"]);
    documents.update({ textDocument: { uri: first, version: 2 }, contentChanges: [{ text: "define ui as config with\n  after = 1\nend\n" }] });
    expect(documents.tree(main)).toBe(tree);
    expect(request("config.ui.")).toEqual(["after"]);
    documents.update({ textDocument: { uri: first, version: 3 }, contentChanges: [{ text: "define ui as settings with\n  after = 1\nend\n" }] });
    expect(request("config.")).toEqual(root ? ["audio", "rootField"] : ["audio"]);
    expect(request("config.ui.")).toEqual([]);
    expect(request("config.audio.")).toEqual(["volume"]);
  });

  test("namespace aliases and cycles cannot mutate cached instance graphs across requests", () => {
    const source = "define ui as config with\n  inner = { initial = 1 }\nend\nfunction mutate()\n  local alias = config.ui.inner\n  alias.extra = 1\n  alias.cycle = config.ui\n  return config.ui.inner.\nend\nfunction inspect()\n  return config.ui.inner.\nend\n";
    const uri = "file:///proj/main.sd";
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
    const document = documents.get(uri)!;
    const tree = documents.tree(uri)!;
    const scripts = new Map([[uri, { annotations: documents.annotations(uri), tree, read: (from: number, to: number) => document.read(from, to) }]]);
    const request = (offset: number) => (getCompletions(document, tree, scripts, undefined, undefined, document.positionAt(offset), undefined) ?? []).map((item) => item.label).sort();
    const mutated = source.indexOf("return config.ui.inner.") + "return config.ui.inner.".length;
    const outside = source.lastIndexOf("return config.ui.inner.") + "return config.ui.inner.".length;
    expect(request(mutated)).toEqual(["cycle", "extra", "initial"]);
    expect(request(outside)).toEqual(["initial"]);
    expect(request(mutated)).toEqual(["cycle", "extra", "initial"]);
    expect(request(outside)).toEqual(["initial"]);
  });

  test.each([[false, "store"], [true, "store"], [false, "define"], [true, "define"]])("loading a foreign namespace cannot replace a current store initialized after the cursor (reverse=%s, declaration=%s)", (reverse, declaration) => {
    const main = "file:///proj/main.sd";
    const library = "file:///proj/shapes.sd";
    const source = "function inspect()\n  return tbl.\nend\nstore tbl = { currentField = 1 }\nstore ref = config.ui\n";
    const foreign = "define ui as config with\n  ownField = 1\nend\n" + (declaration === "store" ? "store tbl = { foreignField = 1 }\n" : "define tbl with\n  foreignField = 1\nend\n");
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri: main, text: source, version: 1, languageId: "sparkdown" } });
    documents.set({ textDocument: { uri: library, text: foreign, version: 1, languageId: "sparkdown" } });
    const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
    const document = documents.get(main)!;
    const uris = reverse ? [library, main] : [main, library];
    const request = () => (getCompletions(document, documents.tree(main), getAnnotatedScripts(main, Object.fromEntries(uris.map((uri) => [uri, 1])), workspace), undefined, undefined, document.positionAt(source.indexOf("tbl.") + "tbl.".length), undefined) ?? []).map((item) => item.label);
    expect(request()).toEqual(["currentField"]);
    expect(request()).toEqual(["currentField"]);
  });

  test.each([false, true])("cross-script parent chains expose the same own instance fields (reverse=%s)", (reverse) => {
    const main = "file:///proj/main.sd";
    const library = "file:///proj/shapes.sd";
    const source = "define Hero as Actor with\n  name = 1\nend\nfunction inspect()\n  return character.Hero.\nend\n";
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri: main, text: source, version: 1, languageId: "sparkdown" } });
    documents.set({ textDocument: { uri: library, text: "define Actor as character with\n  hp = 1\nend\n", version: 1, languageId: "sparkdown" } });
    const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
    const document = documents.get(main)!;
    const uris = reverse ? [library, main] : [main, library];
    const items = getCompletions(document, documents.tree(main), getAnnotatedScripts(main, Object.fromEntries(uris.map((uri) => [uri, 1])), workspace), undefined, undefined, document.positionAt(source.indexOf("character.Hero.") + "character.Hero.".length), undefined) ?? [];
    expect(items.map((item) => item.label)).toEqual(["name"]);
  });

  test("manual and triggered requests offer the same fields, including after whitespace", () => {
    for (const suffix of [".", ".  ", ".x"]) {
      const source = `store t = { x = 1, y = 2 }\nfunction main()\n  return t${suffix}@1\nend\n`;
      expect(labelsAt(source).sort()).toEqual(["x", "y"]);
      expect(labelsAt(source, { trigger: "." }).sort()).toEqual(["x", "y"]);
    }
  });

  test("a partial member replaces the whole member and keeps the receiver", () => {
    const result = complete("store t = { defaultValue = 1 }\nfunction main()\n  return t.def@1ault\nend\n");
    const item = result.items.find((item) => item.label === "defaultValue");
    expect(item?.textEdit).toEqual({
      range: { start: { line: 2, character: 11 }, end: { line: 2, character: 18 } },
      newText: "defaultValue",
    });
  });

  test("a colon offers statically known functions and leaves scalar fields out", () => {
    const source = "store t = { x = 1, f = function() end }\nfunction main()\n  function t:m() end\n  t:  @1\nend\n";
    expect(labelsAt(source).sort()).toEqual(["f", "m"]);
  });

  test("a nested table alias shares later field assignments", () => {
    const source = "function main()\n  local t = { inner = {} }\n  local alias = t.inner\n  alias.x = 1\n  return t.inner.@1\nend\n";
    expect(labelsAt(source)).toEqual(["x"]);
  });

  test("rebinding a local table drops the old fields", () => {
    const source = "function main()\n  local t = { old = 1 }\n  t = { current = 2 }\n  return t.@1\nend\n";
    expect(labelsAt(source)).toEqual(["current"]);
  });

  test("a parameter hides a global table without borrowing its fields", () => {
    const source = "store t = { globalField = 1 }\nfunction main(t)\n  return t.@1\nend\n";
    expect(labelsAt(source)).toEqual([]);
  });

  test("a different function's local table contributes no fields", () => {
    const source = "function other()\n  local t = { privateField = 1 }\nend\nfunction main()\n  return t.@1\nend\n";
    expect(labelsAt(source)).toEqual([]);
  });

  test.each([
    "scene play(t)\n  & local value = t.@1\nend\n",
    "scene play\n  branch part(t)\n    & local value = t.@1\n  end\nend\n",
  ])("a flow parameter hides a stored table without borrowing its fields: %s", (flow) => {
    expect(labelsAt("store t = { globalField = 1 }\n" + flow)).toEqual([]);
  });

  test("an authored nested function captures its scene's local table", () => {
    const source = "scene play\n  local t = { sceneField = 1 }\n  local nested = function()\n    return t.@1\n  end\nend\n";
    expect(labelsAt(source)).toEqual(["sceneField"]);
  });

  test("a genuine nested function named __flow keeps its own parameter identity", () => {
    const source = "scene play\n  local t = { sceneField = 1 }\n  local __flow = function(t)\n    return t.@1\n  end\nend\n";
    expect(labelsAt(source)).toEqual([]);
    expect(labelsAt(source.replace("function(t)", "function()"))).toEqual(["sceneField"]);
  });

  test("a branch parameter hides then restores its scene's local table", () => {
    const source = "scene play\n  local t = { sceneField = 1 }\n  branch part(t)\n    & local value = t.@1\n  end\n  & local value = t.@2\nend\n";
    expect(labelsAt(source, { at: "1" })).toEqual([]);
    expect(labelsAt(source, { at: "2" })).toEqual(["sceneField"]);
  });

  test("a closed branch restores a stored table and its subsequent member assignments", () => {
    const source = "store t = { globalField = 1 }\nscene play\n  branch part(t)\n    & local value = t.@1\n  end\n  & t.extra = 2\n  & local value = t.@2\nend\n";
    expect(labelsAt(source, { at: "1" })).toEqual([]);
    expect(labelsAt(source, { at: "2" }).sort()).toEqual(["extra", "globalField"]);
  });

  test("a sibling branch contributes neither its locals nor its member assignments", () => {
    const source = "scene play\n  local t = { sceneField = 1 }\n  branch first\n    local t = { privateField = 1 }\n    & t.extra = 2\n  end\n  branch second\n    & local value = t.@1\n  end\nend\n";
    expect(labelsAt(source)).toEqual(["sceneField"]);
  });

  test("ordinary strings and comments never offer a table's members", () => {
    for (const line of ['local s = "t.@1"', "-- t.@1", "--[[ t.@1 ]]", "local n = 12.@1"]) {
      const source = `store t = { member = 1 }\nfunction main()\n  ${line}\nend\n`;
      expect(labelsAt(source)).not.toContain("member");
    }
  });

  test("incremental field edits invalidate the old shape", () => {
    const before = "store t = { old = 1 }\nfunction main()\n  return t.\nend\n";
    const source = "store t = { current = 1 }\nfunction main()\n  return t.@1\nend\n";
    expect(labelsAt(source, { editedFrom: before })).toEqual(["current"]);
  });

  test("a quoted index replaces only string content and retains punctuation", () => {
    const result = complete('store t = { ["Item/Foo"] = 1 }\nfunction main()\n  return t["Item/@1"]\nend\n');
    const item = result.items.find((item) => item.label === "Item/Foo");
    expect(item?.textEdit).toEqual({
      range: { start: { line: 2, character: 12 }, end: { line: 2, character: 17 } },
      newText: "Item/Foo",
    });
  });

  test("a dangling dot preserves completion in the following function body", () => {
    const source = "function main()\n  local t = { x = 1 }\n  t.\n  return t.@1\nend\n";
    expect(labelsAt(source)).toEqual(["x"]);
  });

  test("requests in one unchanged document cannot mutate cached define members through aliases or cycles", () => {
    const source = "define Point with\n  inner = { initial = 1 }\nend\nfunction mutate()\n  local alias = Point.inner\n  alias.extra = 1\n  alias.cycle = Point\n  return Point.inner.\nend\nfunction main()\n  return Point.inner.\nend\n";
    const uri = "file:///proj/main.sd";
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
    const document = documents.get(uri)!;
    const tree = documents.tree(uri)!;
    const scripts = new Map([[uri, { annotations: documents.annotations(uri), tree, read: (from: number, to: number) => document.read(from, to) }]]);
    const request = (offset: number) => (getCompletions(document, tree, scripts, undefined, undefined, document.positionAt(offset), undefined) ?? []).map((item) => item.label).sort();
    const afterAssignment = source.indexOf("return Point.inner.") + "return Point.inner.".length;
    const outsideFunction = source.lastIndexOf("return Point.inner.") + "return Point.inner.".length;
    const beforeAssignment = source.indexOf("Point.inner") + "Point.inner".length;
    expect(request(afterAssignment)).toEqual(["cycle", "extra", "initial"]);
    expect(request(outsideFunction)).toEqual(["initial"]);
    expect(request(beforeAssignment)).toEqual(["inner"]);
    expect(request(afterAssignment)).toEqual(["cycle", "extra", "initial"]);
  });

  test("editing another script invalidates its fields while the requesting tree stays unchanged", () => {
    const main = "file:///proj/main.sd";
    const library = "file:///proj/shapes.sd";
    const source = "function main()\n  return Point.\nend\n";
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri: main, text: source, version: 1, languageId: "sparkdown" } });
    documents.set({ textDocument: { uri: library, text: "define Point with\n  before = 1\nend\n", version: 1, languageId: "sparkdown" } });
    const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
    const document = documents.get(main)!;
    const tree = documents.tree(main)!;
    const request = () => (getCompletions(document, tree, getAnnotatedScripts(main, { [main]: 1, [library]: 1 }, workspace), undefined, undefined, document.positionAt(source.indexOf("Point.") + "Point.".length), undefined) ?? []).map((item) => item.label);
    expect(request()).toEqual(["before"]);
    documents.update({ textDocument: { uri: library, version: 2 }, contentChanges: [{ text: "define Point with\n  after = 1\nend\n" }] });
    expect(documents.tree(main)).toBe(tree);
    expect(request()).toEqual(["after"]);
    expect(request()).toEqual(["after"]);
  });

  test("quoted Unicode keys retain their text across repeated requests", () => {
    const source = 'store t = { ["café"] = 1, ["星"] = 2 }\nfunction main()\n  return t["@1"]\nend\n';
    expect(labelsAt(source).sort()).toEqual(["café", "星"]);
  });

  test("a stored alias can resolve a table initialized in another script", () => {
    const main = "file:///proj/main.sd";
    const library = "file:///proj/shapes.sd";
    const source = "store alias = remote\nfunction main()\n  return alias.inner.\nend\n";
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri: main, text: source, version: 1, languageId: "sparkdown" } });
    documents.set({ textDocument: { uri: library, text: "store remote = { inner = { field = 1 } }\n", version: 1, languageId: "sparkdown" } });
    const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
    const document = documents.get(main)!;
    const items = getCompletions(document, documents.tree(main), getAnnotatedScripts(main, { [main]: 1, [library]: 1 }, workspace), undefined, undefined, document.positionAt(source.indexOf("alias.inner.") + "alias.inner.".length), undefined) ?? [];
    expect(items.map((item) => item.label)).toEqual(["field"]);
  });
});
