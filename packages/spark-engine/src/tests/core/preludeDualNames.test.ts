// #371 — prelude dual-defined names.
//
// The prelude defines `typewriter` FOUR ways: a root type (pacing props) and
// a synth / mixer / channel instance (its keystroke sound and routing). Only
// one declaration can hold the flat global; the rest get FlowBase's
// `$<type>_<name>` collision keys. Two things used to go through the flat
// slot's accidental winner:
//
//   1. `as typewriter` parent resolution: with the SYNTH instance first in
//      source order, an authored `define narrator as typewriter` chained
//      through the sound instead of the type — inheriting the tuned synth
//      props while silently missing every pacing prop. `__def` now resolves
//      `as X` to the ROOT type (displaced at `$X_X`) and links the root's
//      chain through the same-named instance, so the union survives BY
//      CONSTRUCTION with the root's props included.
//
//   2. `applyBuiltinOverrides`' back-fill gate keyed on post-scoping
//      identifiers, which differ between the prelude pass and the user pass
//      for exactly these names — a user override of a dual-defined builtin
//      instance silently lost every field it didn't restate. The gate now
//      keys on the stable bare name.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { convertDefine } from "../../game/core/utils/buildContextFromStory";

const URI = "file:///main.sd";

function compileStory(source: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({ textDocument: { uri: URI } });
  return new Story(result.program.compiled as Record<string, any>);
}

const metaVal = (v: any, key: string): any =>
  v?.metatable?.value?.get?.(key) ?? null;
const metaStr = (v: any, key: string): string =>
  String(metaVal(v, key)?.value ?? "");

/** Find a define table in the story's globals by its marker name (and,
 *  optionally, its declared parent) — independent of which GLOBAL KEY the
 *  scoping passes assigned it. Returns the LAST match: globals initialize in
 *  registration order and a later `__def` re-registers over an earlier one
 *  (override-in-place), so the last table is the one the runtime's type
 *  tables actually hold — e.g. an authored override registered after the
 *  prelude incumbent it displaced to a `$prelude_` key. */
function findDefine(story: any, name: string, parent?: string): any {
  const globals: Map<string, any> =
    story.state.variablesState["_globalVariables"];
  let found: any = undefined;
  for (const v of globals.values()) {
    if (
      v &&
      metaStr(v, "__define") === name &&
      (parent === undefined || metaStr(v, "__defineParent") === parent)
    ) {
      found = v;
    }
  }
  return found;
}

describe("same-TYPE builtin override with a choice in the story", () => {
  // `define ambient as channel` re-declares a name the prelude also defines
  // as a channel — the override branch, not the dual-type branch. FlowBase
  // hands the flat slot to the authored declaration; the prelude's incumbent
  // must stay REGISTERED (under `$prelude_ambient`), because its parsed nodes
  // remain in the prelude content and ResolveReferences walks them: an
  // unregistered declaration never generates its runtime, so its `__def`
  // divert throws and silently ABORTS the resolve pass for the whole story.
  // Every author-side reference after the prelude was left unresolved — a
  // project containing any `choose` then lost its compiled story to a null
  // `pathOnChoice` during serialization, with zero diagnostics (found by the
  // R&B project import, whose sound_effects.sd overrides `ambient`).
  const SOURCE = `define ambient as channel with
  loop = true
end

-> start
scene start
  Hello.
  choose
    + [Go]
      Went.
  then
    Done.
end
`;

  test("the story still compiles and the authored override wins", () => {
    // compileStory throws here pre-fix: `program.compiled` is undefined once
    // the aborted resolve pass poisons serialization.
    const story = compileStory(SOURCE);
    const override = findDefine(story, "ambient", "channel");
    expect(override).toBeDefined();
    // Authored value wins; prelude fields the author didn't restate survive
    // via the override back-fill.
    const struct: any = convertDefine(override, story);
    expect(struct.loop).toBe(true);
    expect(struct.mixer).toBe("sound");
    expect(struct.play_behavior).toBe("stack");
  });
});

describe("as-parent resolution for a dual-defined type name", () => {
  const SOURCE = `define narrator as typewriter with
  letter_pause = 0.05
end

-> start
scene start
  Hello.
end
`;

  test("an authored `as typewriter` chains through the ROOT type", () => {
    const story = compileStory(SOURCE);
    const narrator = findDefine(story, "narrator", "typewriter");
    expect(narrator).toBeDefined();
    // Direct parent must be the root TYPE (no parent marker of its own) —
    // not the synth instance that happens to also be named `typewriter`.
    const parent = metaVal(narrator, "__index");
    expect(parent).toBeTruthy();
    expect(metaStr(parent, "__define")).toBe("typewriter");
    expect(metaStr(parent, "__defineParent")).toBe("");
  });

  test("the chain carries pacing AND the tuned voice payload", () => {
    const story = compileStory(SOURCE);
    const narrator = findDefine(story, "narrator", "typewriter");
    // Raw chain truth (no deep-fill involved): `convertDefine` merges the
    // `__index` chain only.
    const struct: any = convertDefine(narrator, story);
    expect(struct.letter_pause).toBe(0.05); // authored
    expect(struct.phrase_pause_scale).toBe(5); // root type (was MISSING)
    expect(struct.em_dash_pause_scale).toBe(16); // root type
    expect(struct.shape).toBe("tangent"); // tuned synth via the chain link
    expect(struct.envelope?.attack).toBe(0.01); // tuned synth
  });
});

describe("override back-fill for a dual-defined builtin instance", () => {
  const SOURCE = `define typewriter as channel with
  loop = true
end

-> start
scene start
  Hello.
end
`;

  test("a partial override keeps the builtin instance's other fields", () => {
    const story = compileStory(SOURCE);
    const override = findDefine(story, "typewriter", "channel");
    expect(override).toBeDefined();
    const struct: any = convertDefine(override, story);
    expect(struct.loop).toBe(true); // authored
    // Back-filled from the prelude's channel-typed `typewriter` — the
    // channel ROOT's default is a `mixer.none` REF, so a plain "sound"
    // proves the INSTANCE's value survived, not just chain inheritance.
    expect(struct.mixer).toBe("sound");
    expect(struct.play_behavior).toBe("replace");
  });
});
