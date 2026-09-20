// The set of names used as a define TYPE (`define D as X`, `new X()`) steers
// two things: the shadow warning in `validateDefineTypeShadow`, and which
// defines `scopeDefineInstances` moves to a synthetic `$<type>_<name>` key. It
// is needed in full before any chunk of a document lowers, so it was recollected
// by walking the document's whole syntax tree after every edit, and every
// script's tree again on every compile (#649).
//
// These checks pin the two halves of the contract:
//
//  - COST. After an edit, the collector visits only the nodes the parser
//    rebuilt, not the document. `defineTypeNameWalkStats` counts the nodes the
//    walk stepped over, so a full-document walk is visible as a count near the
//    cold-parse one. The compiler's whole-program pass reuses the same
//    per-document sets rather than walking each script again, and the builtins
//    prelude, whose text never changes, is walked once.
//  - RESULT. The set the incremental path produces equals the set a cold parse
//    of the same text produces, for edits that add, remove and rename an
//    `as`-parent and a `new X()` target deep inside a function body, and a name
//    entering or leaving the set changes how chunks far from the edit lower.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import {
  collectDefineTypeNames,
  defineTypeNameWalkStats,
  resetDefineTypeNameWalkStats,
} from "../../compiler/utils/collectDefineTypeNames";

const URI = "inmemory:///main.sd";

let nextVersion = 2;

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/**
 * A long document whose define types sit at the top, whose `new X()` targets sit
 * deep inside function bodies far below them, and whose bulk is prose an edit
 * can land in without changing any binding.
 */
function fixture() {
  const L: string[] = [];
  L.push("title: Define Type Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("define base_actor as object:");
  L.push("  hp = 10");
  L.push("");
  L.push("define hero as base_actor:");
  L.push(`  name = "Hero"`);
  L.push("");
  L.push("define villain as base_actor:");
  L.push(`  name = "Villain"`);
  L.push("");
  L.push("define spawner as object:");
  L.push("  rate = 1");
  L.push("");
  for (let b = 0; b < 12; b++) {
    L.push(`function build_${b}()`);
    for (let i = 0; i < 30; i++) {
      L.push(`  local pad_${b}_${i} = ${i} + 1`);
    }
    // A `new X()` target nested two blocks deep, which is why the walk cannot
    // stop at the top-level children.
    L.push("  if pad_" + b + "_1 > 0 then");
    L.push("    for i = 1, 3 do");
    L.push(`      local made_${b} = new spawner()`);
    L.push("    end");
    L.push("  end");
    L.push(`  return pad_${b}_1`);
    L.push("end");
    L.push("");
  }
  for (let s = 0; s < 12; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    for (let i = 0; i < 12; i++) {
      L.push(`  Action describing room ${s} in careful detail, line ${i}.`);
    }
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

function open(text: string) {
  const registry = new SparkdownDocumentRegistry(["compilations"]);
  registry.add({
    textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
  });
  return registry;
}

function insert(registry: SparkdownDocumentRegistry, text: string, offset: number, inserted: string) {
  const at = posAt(text, offset);
  registry.update({
    textDocument: { uri: URI, version: nextVersion++ },
    contentChanges: [{ range: { start: at, end: at }, text: inserted }],
  });
  return text.slice(0, offset) + inserted + text.slice(offset);
}

function replace(
  registry: SparkdownDocumentRegistry,
  text: string,
  find: string,
  replacement: string,
) {
  const offset = text.indexOf(find);
  expect(offset, `fixture is missing ${JSON.stringify(find)}`).toBeGreaterThanOrEqual(0);
  registry.update({
    textDocument: { uri: URI, version: nextVersion++ },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replacement,
      },
    ],
  });
  return text.slice(0, offset) + replacement + text.slice(offset + find.length);
}

function configured(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler;
}

/** The set the registry now holds for `uri`. */
function names(registry: SparkdownDocumentRegistry) {
  return [...registry.defineTypeNames(URI)].sort();
}

/** The set a full walk of the registry's current tree produces. */
function coldNames(registry: SparkdownDocumentRegistry) {
  const tree = registry.tree(URI)!;
  const text = registry.get(URI)!.getText();
  return [...collectDefineTypeNames(tree, (f, t) => text.slice(f, t))].sort();
}

describe("define type names are collected incrementally (#649)", () => {
  it("costs a registry that does not lower nothing per edit", () => {
    // The language server's registry and the VS Code document manager's both
    // annotate for editor features only, with no `compilations`. The names
    // steer lowering and nothing else, so neither may pay for an index on
    // every keystroke.
    let text = fixture();
    const registry = new SparkdownDocumentRegistry([
      "declarations",
      "formatting",
      "references",
    ]);
    resetDefineTypeNameWalkStats();
    registry.add({
      textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
    });
    expect(defineTypeNameWalkStats().nodes).toBe(0);

    const offset = text.lastIndexOf("careful") + "careful".length;
    resetDefineTypeNameWalkStats();
    text = insert(registry, text, offset, "z");
    const edited = defineTypeNameWalkStats();
    expect(
      edited.nodes,
      `a registry with no compilation annotator walked ${edited.nodes} nodes over ${JSON.stringify(edited.ranges)}`,
    ).toBe(0);

    // A caller that asks anyway still gets the right answer, by walking.
    expect(names(registry)).toEqual(coldNames(registry));
  });

  it("visits only the rebuilt region after an edit", () => {
    let text = fixture();
    const registry = open(text);
    // The cold parse's walk is the ceiling an edit must stay far below.
    resetDefineTypeNameWalkStats();
    coldNames(registry);
    const fullWalkNodes = defineTypeNameWalkStats().nodes;
    expect(fullWalkNodes).toBeGreaterThan(2000);

    // Extend a prose word in the LAST scene — as far from the defines at the
    // top of the document as the fixture allows.
    const offset = text.lastIndexOf("careful") + "careful".length;
    resetDefineTypeNameWalkStats();
    text = insert(registry, text, offset, "z");
    const edited = defineTypeNameWalkStats();

    expect(
      edited.nodes,
      `an edit walked ${edited.nodes} nodes; a cold walk of the whole document is ${fullWalkNodes}. ` +
        `Ranges walked: ${JSON.stringify(edited.ranges)}`,
    ).toBeLessThan(1000);
    expect(names(registry)).toEqual(coldNames(registry));
  });

  it("matches a cold walk when a type name is added, removed or renamed", () => {
    let text = fixture();
    const registry = open(text);

    // An `as`-parent gains a type name.
    text = replace(registry, text, "define spawner as object:", "define spawner as base_actor:");
    expect(names(registry)).toEqual(coldNames(registry));

    // A `new X()` target deep inside a function body is renamed. Renaming the
    // define it names as well keeps the document's bindings intact.
    text = replace(registry, text, "define spawner as base_actor:", "define maker as base_actor:");
    while (text.includes("new spawner()")) {
      text = replace(registry, text, "new spawner()", "new maker()");
    }
    expect(names(registry)).toEqual(coldNames(registry));
    expect(names(registry)).toContain("maker");
    expect(names(registry)).not.toContain("spawner");

    // The last `new X()` target for `base_actor` leaves the set.
    text = replace(registry, text, "define hero as base_actor:", "define hero as object:");
    text = replace(registry, text, "define villain as base_actor:", "define villain as object:");
    text = replace(registry, text, "define maker as base_actor:", "define maker as object:");
    expect(names(registry)).toEqual(coldNames(registry));
    expect(names(registry)).not.toContain("base_actor");

    // And a type name is added back by a brand new `new X()` deep in a body.
    text = replace(registry, text, "local made_0 = new maker()", "local made_0 = new maker()\n      local also_0 = new hero()");
    expect(names(registry)).toEqual(coldNames(registry));
    expect(names(registry)).toContain("hero");
  });

  it("does not re-walk every script on each compile", () => {
    const text = fixture();
    const compiler = configured(text);
    compiler.compile({ textDocument: { uri: URI } });

    // A second compile of untouched documents: the whole-program scoping pass
    // reads the sets the registry already holds, including the builtins
    // prelude's, whose text never changes.
    resetDefineTypeNameWalkStats();
    compiler.compile({ textDocument: { uri: URI } });
    expect(defineTypeNameWalkStats().nodes).toBe(0);

    // And after an edit, only that document's rebuilt region is walked.
    const offset = text.lastIndexOf("careful") + "careful".length;
    const at = posAt(text, offset);
    resetDefineTypeNameWalkStats();
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: "z" }],
    });
    compiler.compile({ textDocument: { uri: URI } });
    const walked = defineTypeNameWalkStats();
    expect(
      walked.nodes,
      `an edit plus a compile walked ${walked.nodes} nodes over ${JSON.stringify(walked.ranges)}`,
    ).toBeLessThan(1000);
  });

  it("compiles the same program as a cold compile when a name enters the set far from its defines", () => {
    const text = fixture();
    const incremental = configured(text);
    incremental.compile({ textDocument: { uri: URI } });

    // `hero` is used only as an `as`-parent target here — it enters the type
    // set through a `new hero()` twenty blocks away from its own define, which
    // changes how the `define hero` chunk must lower even though that chunk is
    // untouched.
    const find = "local made_0 = new spawner()";
    const offset = text.indexOf(find);
    expect(offset).toBeGreaterThanOrEqual(0);
    const inserted = "\n      local also_0 = new hero()";
    const at = posAt(text, offset + find.length);
    incremental.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: inserted }],
    });
    const afterText =
      text.slice(0, offset + find.length) + inserted + text.slice(offset + find.length);
    const incrementalProgram = incremental.compile({
      textDocument: { uri: URI },
    }).program;
    const coldProgram = configured(afterText).compile({
      textDocument: { uri: URI },
    }).program;

    // The scoping this change steers shows up in the compiled ink's global
    // keys, so compare the compiled output rather than the set alone.
    expect(JSON.stringify(incrementalProgram.compiled)).toEqual(
      JSON.stringify(coldProgram.compiled),
    );
    expect(JSON.stringify(incrementalProgram.context)).toEqual(
      JSON.stringify(coldProgram.context),
    );
  });
});
