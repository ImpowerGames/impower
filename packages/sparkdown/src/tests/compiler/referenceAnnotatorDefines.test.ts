import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

// The ReferenceAnnotator D2 surface: define-name / define-type / struct-property
// references for the Luau-port grammar. The define model is INVERTED relative to
// the pre-port grammar (`define <Type> <Name>` → `define <Name> as <Parent>`), and
// the struct body is now a flat indentation tree of LuauStructScalarProperty /
// LuauStructObjectHeader / LuauStructArrayItem lines (no per-item wrapper nodes).
// These tests lock the restored symbol-ID shapes the providers (getReferences /
// getSymbolIds / getRenameEdits / getHover) match against:
//   - OOP define:  name → `<parent>.<name>` (define_variable_name),
//                  parent → `<parent>` (define_type_name),
//                  property → `<parent>.<name>.<prop>` (property),
//                  character `name = "X"` value → `character.?.name=X` (character_name).
//   - root define: name (no parent) → `<name>` (define_type_name); props under `$default`.
//   - structural (style/screen/component/animation/theme): type is the KEYWORD,
//                  name → `<keyword>.<name>`; struct props → `<keyword>.<name>.<path>`;
//                  screen layer names also emit `layer.<class>` + interdependent
//                  `style.<class>`; style props emit interdependent `layer.<class>`.

interface Ref {
  declaration?: string;
  kind?: string;
  symbolIds?: string[];
  interdependentIds?: string[];
  linkable?: boolean;
  text: string;
}

function collectReferences(source: string): Ref[] {
  const reg = new SparkdownDocumentRegistry(["references"]);
  const uri = "file:///refdef.sd";
  reg.set({
    textDocument: { uri, text: source, version: 1, languageId: "sparkdown" },
  });
  const annotations = reg.annotations(uri);
  if (!annotations) throw new Error("no annotations");
  const out: Ref[] = [];
  const cur = annotations.references.iter();
  while (cur.value) {
    const v = (cur.value as any).type ?? {};
    out.push({
      declaration: v.declaration,
      kind: v.kind,
      symbolIds: v.symbolIds,
      interdependentIds: v.interdependentIds,
      linkable: v.linkable,
      text: source.slice(cur.from, cur.to),
    });
    cur.next();
  }
  return out;
}

const find = (refs: Ref[], text: string, declaration?: string) =>
  refs.find(
    (r) =>
      r.text === text && (declaration == null || r.declaration === declaration),
  );

describe("ReferenceAnnotator · defines (D2)", () => {
  test("OOP define: name, parent, properties, character-name value", () => {
    const refs = collectReferences(`define raffles as character with
  name = "RAFFLES"
  color = "teal"
end
`);
    const name = find(refs, "raffles", "define_variable_name");
    expect(name?.symbolIds).toContain("character.raffles");
    expect(name?.kind).toBe("write");
    expect(name?.linkable).toBe(true);

    const parent = find(refs, "character", "define_type_name");
    expect(parent?.symbolIds).toContain("character");

    const prop = find(refs, "name", "property");
    expect(prop?.symbolIds).toContain("character.raffles.name");
    expect(prop?.kind).toBe("write");

    const colorProp = find(refs, "color", "property");
    expect(colorProp?.symbolIds).toContain("character.raffles.color");

    // The character `name = "X"` value is the cross-reference target a
    // dialogue cue (`X:`) resolves to via `character.?.name=X`.
    const charName = find(refs, "RAFFLES", "character_name");
    expect(charName?.symbolIds).toContain("character.?.name=RAFFLES");
  });

  test("dialogue cue resolves to the define name (shared symbolId)", () => {
    const refs = collectReferences(`define hero as character with
  name = "HERO"
end
hero: Hi.
`);
    // Define name emits character.hero (write); cue emits character.hero (read).
    const decl = find(refs, "hero", "define_variable_name");
    expect(decl?.symbolIds).toContain("character.hero");
    const cueReads = refs.filter((r) => r.text === "hero" && r.kind === "read");
    expect(cueReads.some((r) => r.symbolIds?.includes("character.hero"))).toBe(
      true,
    );
  });

  test("root define (no parent): name is the type", () => {
    const refs = collectReferences(`define animation with
  duration = 1
end
`);
    const typeName = find(refs, "animation", "define_type_name");
    expect(typeName?.symbolIds).toContain("animation");
    const prop = find(refs, "duration", "property");
    expect(prop?.symbolIds).toContain("animation.$default.duration");
  });

  test("style: name, property, interdependent layer ids", () => {
    const refs = collectReferences(`style my_button with
  background-color = blue
  hovered:
    color = red
end
`);
    const name = find(refs, "my_button", "define_variable_name");
    expect(name?.symbolIds).toContain("style.my_button");

    const bg = find(refs, "background-color", "property");
    expect(bg?.symbolIds).toContain("style.my_button.background-color");
    expect(bg?.interdependentIds).toContain("layer.background-color");

    const hovered = find(refs, "hovered", "property");
    expect(hovered?.symbolIds).toContain("style.my_button.hovered");

    const nested = find(refs, "color", "property");
    expect(nested?.symbolIds).toContain("style.my_button.hovered.color");
  });

  test("screen: layer names emit layer ids + interdependent style ids", () => {
    const refs = collectReferences(`screen title_screen with
  stage:
    backdrop:
      image = "bg"
end
`);
    const screenName = find(refs, "title_screen", "define_variable_name");
    expect(screenName?.symbolIds).toContain("screen.title_screen");

    const backdrop = find(refs, "backdrop", "property");
    expect(backdrop?.symbolIds).toContain("layer.backdrop");
    expect(backdrop?.symbolIds).toContain(
      "screen.title_screen.stage.backdrop",
    );
    expect(backdrop?.interdependentIds).toContain("style.backdrop");
  });

  test("screen layer interdependency links to a same-named style block", () => {
    // The screen layer `backdrop` (interdependent style.backdrop) and the
    // `style backdrop` block name (style.backdrop) share a resolvable id.
    const refs = collectReferences(`screen s with
  backdrop:
    image = "bg"
end
style backdrop with
  background-color = black
end
`);
    const layer = find(refs, "backdrop", "property");
    expect(layer?.interdependentIds).toContain("style.backdrop");
    const styleName = find(refs, "backdrop", "define_variable_name");
    expect(styleName?.symbolIds).toContain("style.backdrop");
  });

  test("animation: $extends parent is a read-ref to the same type", () => {
    const refs = collectReferences(`animation pan_right as animation with
  target = layer.self
  keyframes:
    -
      background_position = "right"
end
`);
    const name = find(refs, "pan_right", "define_variable_name");
    expect(name?.symbolIds).toContain("animation.pan_right");

    // The trailing `as animation` is a read reference to the animation type.
    const ext = refs.find(
      (r) => r.text === "animation" && r.kind === "read",
    );
    expect(ext?.symbolIds).toContain("animation.animation");

    const tgt = find(refs, "target", "property");
    expect(tgt?.symbolIds).toContain("animation.pan_right.target");
  });
});
