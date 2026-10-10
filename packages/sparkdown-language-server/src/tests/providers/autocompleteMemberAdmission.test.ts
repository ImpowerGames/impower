import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStaticMemberCompletions } from "../../utils/providers/getStaticMemberCompletions";

describe("static member admission in declaration headers (#867)", () => {
  test.each<[string, string, string[]]>([
    ["a colon declaration header", "store tbl = { field = 1 }\nfunction tbl:something@1() end\n", ["tbl"]],
    ["a handler's nested colon declaration header", 'store tbl = { field = 1 }\nlayout hud with\n  button "Go" @click={ function tbl:something@1() end }\nend\n', ["hud", "tbl"]],
  ])("%s declines member completion and preserves the general fallback", (_name, source, fallback) => {
    const uri = "file:///proj/main.sd";
    const cursor = source.indexOf("@1");
    const text = source.replace("@1", "");
    const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
    documents.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
    const document = documents.get(uri)!;
    const tree = documents.tree(uri)!;
    let owner = tree.resolveInner(cursor, -1);
    while (owner.parent && owner.name !== "LuauFunctionDefinition") owner = owner.parent;
    expect(owner.name).toBe("LuauFunctionDefinition");
    const header = owner.getChild("LuauFunctionDefinition_content")?.getChild("LuauAccessPath");
    expect(header, "the declaration owns its header directly, separately from the body").toBeTruthy();
    if (!header) throw new Error("Expected an owned function header");
    expect(document.read(header.from, header.to)).toBe("tbl:something");
    const accessor = getDescendent("LuauAccessorOperator", header);
    expect(accessor && document.read(accessor.from, accessor.to)).toBe(":");
    expect(cursor).toBeGreaterThanOrEqual(header.from);
    expect(cursor).toBeLessThanOrEqual(header.to);
    const scripts = new Map([[uri, {
      tree, annotations: documents.annotations(uri),
      read: (from: number, to: number) => document.read(from, to),
    }]]);
    expect(getStaticMemberCompletions(document, tree, scripts, cursor)).toBeUndefined();
    // General declaration-name completion belongs to #865. These exact
    // fallback labels predate #867; they are not receiver member suggestions.
    expect(labelsAt(source).sort()).toEqual(fallback);
  });
});

