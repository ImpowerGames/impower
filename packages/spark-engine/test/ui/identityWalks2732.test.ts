import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { INPUT_WIDGETS } from "../../src/game/modules/ui/classes/UIModule";
import { BODY_CHILDREN, bodyChildLists } from "../../src/game/modules/ui/utils/bodyChildren";
import { createHarness } from "./harness/uiTestHarness";

const REPO = join(__dirname, "../../../..");
const NODE_TYPES = join(REPO, "packages/sparkdown/src/compiler/types/SparkleNode.ts");
const UI_MODULE = join(REPO, "packages/spark-engine/src/game/modules/ui/classes/UIModule.ts");

interface KindShape {
  kind: string;
  lists: { field: string; nested: boolean }[];
}

function bodyNodeKinds(): KindShape[] {
  const file = ts.createSourceFile(NODE_TYPES, readFileSync(NODE_TYPES, "utf8"), ts.ScriptTarget.Latest, true);
  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  let members: string[] = [];
  file.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node)) {
      interfaces.set(node.name.text, node);
    }
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "BodyNode" && ts.isUnionTypeNode(node.type)) {
      members = node.type.types.map((t) => t.getText(file));
    }
  });
  expect(members.length).toBeGreaterThan(0);
  return members.map((name) => {
    const decl = interfaces.get(name);
    expect(decl, name).toBeDefined();
    let kind = "";
    const lists: KindShape["lists"] = [];
    for (const member of decl!.members) {
      if (!ts.isPropertySignature(member) || !member.type || !ts.isIdentifier(member.name)) {
        continue;
      }
      const field = member.name.text;
      const type = member.type.getText(file);
      if (field === "kind" && ts.isLiteralTypeNode(member.type)) {
        kind = (member.type.literal as ts.StringLiteral).text;
      } else if (type === "BodyNode[]") {
        lists.push({ field, nested: false });
      } else if (type.includes("BodyNode[]")) {
        lists.push({ field, nested: true });
      }
    }
    return { kind, lists };
  });
}

const marker = (name: string, clear: boolean) => ({
  kind: "element",
  tag: name,
  classes: [],
  props: clear ? { clear: { kind: "literal", value: true } } : {},
  events: [],
  children: [],
});

function sample(shape: KindShape, clear: boolean): { node: any; markers: string[] } {
  const markers: string[] = [];
  const node: any = { kind: shape.kind };
  if (shape.kind === "element") {
    Object.assign(node, { tag: "holder", classes: [], props: {}, events: [] });
  }
  for (const { field, nested } of shape.lists) {
    const name = `marker_${shape.kind}_${field}`;
    markers.push(name);
    node[field] = nested ? [{ children: [marker(name, clear)] }] : [marker(name, clear)];
  }
  return { node, markers };
}

describe("every node kind of the layout tree is walked the same way (I-2732)", () => {
  const kinds = bodyNodeKinds();

  test("the child table names exactly the kinds of BodyNode", () => {
    expect(Object.keys(BODY_CHILDREN).sort()).toEqual(kinds.map((k) => k.kind).sort());
  });

  test.each(kinds.map((k) => [k.kind, k] as const))("%s: the child table reaches every child list the type declares", (_, shape) => {
    const { node, markers } = sample(shape, true);
    const reached = bodyChildLists(node).flatMap(([, children]) => (children ?? []).map((c: any) => c.tag));
    expect(reached.sort()).toEqual([...markers].sort());
  });

  test("the mark walk records, and the fingerprint sees, a #clear in every child list of every kind", async () => {
    const h = createHarness("scene start\n  Hello.\nend\n", 0, { connect: false });
    const ui: any = h.game.module.ui;
    const program: any = h.game.program;
    const install = (clearing: string | null) => {
      const nodes: any[] = [];
      const all: string[] = [];
      for (const shape of kinds) {
        const { node, markers } = sample(shape, false);
        for (const list of bodyChildLists(node)) {
          for (const child of (list[1] ?? []) as any[]) {
            if (clearing === null || child.tag === clearing) {
              child.props = { clear: { kind: "literal", value: true } };
            }
          }
        }
        nodes.push(node);
        all.push(...markers);
      }
      program.sparkle.layouts.probe = { kind: "layout", name: "probe", children: nodes };
      ui.initLayouts();
      return all;
    };
    const markers = install(null);
    expect(markers.length).toBeGreaterThan(kinds.length);
    for (const name of markers) {
      expect(ui._clearPaths.get(name), name).toHaveLength(1);
    }
    const roots = new Set<string>();
    for (const name of markers) {
      install(name);
      expect(ui._clearPaths.get(name), name).toHaveLength(1);
      expect(markers.filter((other) => other !== name && ui._clearPaths.has(other)), name).toEqual([]);
      roots.add(ui._roots.get("layout:probe"));
    }
    expect(roots.size).toBe(markers.length);
  });
});

describe("every route that mounts an element from a node gives it the node's path (I-2732)", () => {
  const source = readFileSync(UI_MODULE, "utf8");
  const body = source.slice(source.indexOf("  protected createNodeElement("), source.indexOf("    const style: Record<string, string | null> = {};"));
  const routed = [...body.matchAll(/node\.tag === "([a-z_]+)"/g)].map((m) => m[1]!);

  test("createNodeElement is reached only through mountElement, which records the path", () => {
    expect(routed.length).toBeGreaterThan(0);
    expect(source.match(/this\.createNodeElement\(/g)).toHaveLength(1);
    expect(source).toContain("return this.notePath(this.createNodeElement(parent, node, scope, before), node, scope);");
    for (const route of ["mountInputWidget", "mountDropdown", "mountTextarea", "mountOption"]) {
      expect(source.match(new RegExp(`this\\.${route}\\(`, "g")), route).toHaveLength(1);
    }
  });

  test("a #clear element of every widget tag and every routed tag carries a marked path", async () => {
    const tags = [...Object.keys(INPUT_WIDGETS), ...routed.filter((tag) => tag !== "option")];
    const lines = tags.map((tag) =>
      tag === "dropdown"
        ? `    dropdown.probe_dropdown #clear {\n      option.probe_option #clear "A" #value="a"\n    }`
        : `    ${tag}.probe_${tag} #clear "Label"`,
    );
    const h = createHarness(`layout textbox {\n  textbox {\n${lines.join("\n")}\n    box.probe_box #clear { text }\n  }\n}\n\nscene start\n  Hello.\nend\n`);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    const names = [...tags.map((tag) => `probe_${tag}`), "probe_box", ...(routed.includes("option") ? ["probe_option"] : [])];
    const marked = new Set([...ui._clearPaths.values()].flat());
    for (const name of names) {
      const elements: any[] = ui.textElements(name);
      expect(elements.length, name).toBeGreaterThan(0);
      for (const el of elements) {
        expect(marked.has(ui.elementPath(el)), name).toBe(true);
      }
    }
  });
});
